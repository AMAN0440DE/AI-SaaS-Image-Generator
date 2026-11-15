import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import * as Sentry from "@sentry/nextjs";
import { geminiProvider } from "@/lib/gemini";
import { ACCEPTED_SOURCE_IMAGE_MIME_TYPES } from "@/lib/constants";
import { getStylePreset } from "@/lib/style-presets";

import { APICallError, generateImage, NoImageGeneratedError } from "ai";
import { uploadBufferToImageKit } from "@/lib/imagekit";

export const runtime = "nodejs";

type GenerateImageRequest = {
  sourceImageUrl?: string;
  sourceMimeType?: string;
  originalFileName?: string;
  styleSlug?: string;
  model?: string;
};

export async function POST(request: Request) {
  const { userId, has } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let monthlyLimit = 3;
  let usedThisMonth = 0;

  if (process.env.DATABASE_URL) {
    try {
      const [{ countGenerationsSince, utcMonthStart }, { getMonthlyGenerationLimit }] =
        await Promise.all([import("@/db/generations"), import("@/lib/generation-quota")]);

      monthlyLimit = getMonthlyGenerationLimit(has);
      usedThisMonth = await countGenerationsSince(userId, utcMonthStart());

      if (usedThisMonth >= monthlyLimit) {
        Sentry.logger.warn("generation.quota_exceeded", {
          limit: monthlyLimit,
          used: usedThisMonth,
        });

        return NextResponse.json(
          {
            error: `Monthly generation limit reached (${monthlyLimit} images). Upgrade your plan or try again next month.`,
            code: "QUOTA_EXCEEDED" as const,
            limit: monthlyLimit,
            used: usedThisMonth,
          },
          { status: 429 },
        );
      }
    } catch (quotaError) {
      console.warn("Could not check generation quota from database:", quotaError);
    }
  }

  if (!geminiProvider) {
    return NextResponse.json({ error: "Missing GEMINI_API_KEY." }, { status: 500 });
  }

  const body = (await request.json()) as GenerateImageRequest;

  const { model, originalFileName, sourceImageUrl, sourceMimeType, styleSlug } = body;

  if (!sourceImageUrl) {
    return NextResponse.json({ error: "Please upload an image first." }, { status: 400 });
  }

  if (typeof sourceMimeType !== "string" || !ACCEPTED_SOURCE_IMAGE_MIME_TYPES.has(sourceMimeType)) {
    return NextResponse.json(
      { error: "Only JPG, PNG, and WEBP files are supported." },
      { status: 400 },
    );
  }

  if (typeof styleSlug !== "string") {
    return NextResponse.json({ error: "Please choose a style." }, { status: 400 });
  }

  if (!model) {
    return NextResponse.json({ error: "Please choose a model." }, { status: 400 });
  }

  const preset = getStylePreset(styleSlug);
  if (!preset) {
    return NextResponse.json({ error: "Unknown style preset." }, { status: 400 });
  }

  const imageResponse = await fetch(sourceImageUrl);
  if (!imageResponse.ok) {
    return NextResponse.json(
      { error: "Could not fetch the uploaded source image." },
      { status: 404 },
    );
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  const prompt = [
    preset.prompt,
    "Do not add extra people, extra limbs, duplicate subjects, or change the overall camera angle.",
  ].join("\n\n");

  try {
    const result = await Sentry.startSpan(
      {
        name: `image edit ${model}`,
        op: "gen_ai.request",
        attributes: {
          "gen_ai.request.model": model,
          "gen_ai.operation.name": "request",
          "gen_ai.request.messages": JSON.stringify([
            { role: "user", content: prompt },
            { role: "user", content: "[source image attachment omitted]" },
          ]),
        },
      },
      async (span) => {
        const out = await generateImage({
          model: geminiProvider!.image(model),
          prompt: {
            images: [imageBuffer],
            text: prompt,
          },
          providerOptions: {
            google: {
              responseModality: "image",
            },
          },
        });

        const u = out.usage;

        if (u.inputTokens != null) {
          span.setAttribute("gen_ai.usage.input_tokens", u.inputTokens);
        }

        if (u.outputTokens != null) {
          span.setAttribute("gen_ai.usage.output_tokens", u.outputTokens);
        }
        if (u.totalTokens != null) {
          span.setAttribute("gen_ai.usage.total_tokens", u.totalTokens);
        }

        span.setAttribute(
          "gen_ai.response.text",
          JSON.stringify(["[image generated; pixel data not sent to Sentry]"]),
        );

        return out;
      },
    );

    const imageBase64 = result.image.base64;
    const resultBuffer = Buffer.from(imageBase64, "base64");

    const { url: resultImageUrl } = await uploadBufferToImageKit({
      buffer: resultBuffer,
      fileName: `${preset.slug}-result.png`,
      folder: `/users/${userId}/results`,
      mimeType: "image/png",
    });

    let savedGeneration = null;
    try {
      const { createGeneration } = await import("@/db/generations");
      savedGeneration = await createGeneration({
        clerkUserId: userId,
        originalFileName: typeof originalFileName === "string" ? originalFileName : null,
        sourceImageUrl,
        resultImageUrl,
        styleSlug: preset.slug,
        styleLabel: preset.label,
        model,
        promptUsed: prompt,
      });

      Sentry.logger.info("generation.completed", {
        generationId: savedGeneration.id,
        styleSlug: preset.slug,
        model,
      });
    } catch (dbError) {
      console.warn("Could not save generation record to database:", dbError);
      savedGeneration = {
        id: `temp-${Date.now()}`,
        clerkUserId: userId,
        originalFileName: typeof originalFileName === "string" ? originalFileName : null,
        sourceImageUrl,
        resultImageUrl,
        styleSlug: preset.slug,
        styleLabel: preset.label,
        model,
        promptUsed: prompt,
        createdAt: new Date(),
      };
    }

    return NextResponse.json({
      imageBase64,
      mimeType: "image/png",
      promptUsed: prompt,
      style: { slug: preset.slug, label: preset.label },
      model,
      savedGeneration,
    });
  } catch (error: unknown) {
    console.error("generate-image route failed", error);

    let actualError: unknown = error;
    if (
      actualError &&
      typeof actualError === "object" &&
      "lastError" in actualError &&
      (actualError as { lastError: unknown }).lastError
    ) {
      actualError = (actualError as { lastError: unknown }).lastError;
    }

    if (APICallError.isInstance(actualError)) {
      let message = actualError.message;
      if (actualError.statusCode === 429) {
        message =
          "Gemini API rate limit reached or quota exhausted. Please check your Google AI Studio billing.";
      }
      return NextResponse.json(
        { error: message || "Image generation failed. Please try again." },
        { status: actualError.statusCode ?? 500 },
      );
    }

    if (NoImageGeneratedError.isInstance(actualError)) {
      return NextResponse.json({ error: "The model did not return an image." }, { status: 502 });
    }

    const fallbackMsg =
      actualError instanceof Error && actualError.message
        ? actualError.message
        : "Image generation failed. Please try again.";

    return NextResponse.json(
      { error: fallbackMsg },
      { status: 500 },
    );
  }
}
