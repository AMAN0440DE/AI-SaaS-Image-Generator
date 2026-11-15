export const imageModels = ["gemini-2.0-flash-preview-image-generation"];

export type ImageModel = (typeof imageModels)[number];

export const imageModelLabels: Record<ImageModel, string> = {
  "gemini-2.0-flash-preview-image-generation": "Gemini 2.0 Flash",
};
