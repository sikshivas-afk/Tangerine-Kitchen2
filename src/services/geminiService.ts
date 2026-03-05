import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Recipe {
  name: string;
  ingredients: string[];
  instructions: string;
  youtubeUrl?: string;
}

export async function validateFoodItem(foodItem: string): Promise<boolean> {
  const prompt = `Is "${foodItem}" a real food item or a dish? 
  Respond with only "true" if it is a real food item, dish, or ingredient, and "false" otherwise.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });

  return response.text?.trim().toLowerCase() === "true";
}

export async function getRecipesForFood(foodItem: string, language: string = "English"): Promise<Recipe[]> {
  const prompt = `Find 10 real, popular recipes for "${foodItem}". 
  For each recipe, provide the recipe name, ingredients, instructions, and if available, a high-quality YouTube video tutorial URL for that specific recipe.
  Ensure the recipes are diverse and the YouTube links (if provided) are valid and directly related to the recipe.
  Please respond in ${language}.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Name of the recipe" },
            ingredients: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "List of ingredients" 
            },
            instructions: { type: Type.STRING, description: "Step-by-step cooking instructions" },
            youtubeUrl: { type: Type.STRING, description: "The URL of the YouTube video tutorial for this recipe (optional)" }
          },
          required: ["name", "ingredients", "instructions"]
        }
      }
    }
  });

  try {
    const rawRecipes: Recipe[] = JSON.parse(response.text || "[]");
    return rawRecipes;
  } catch (e) {
    console.error("Failed to parse recipes", e);
    return [];
  }
}

export async function translateFoodItems(items: string[], targetLanguage: string): Promise<string[]> {
  if (items.length === 0) return [];
  
  const prompt = `Translate the following food items into ${targetLanguage}. 
  Return only a JSON array of strings in the same order.
  Items: ${JSON.stringify(items)}`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to translate items", e);
    return items;
  }
}
