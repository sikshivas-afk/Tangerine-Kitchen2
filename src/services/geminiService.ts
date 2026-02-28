import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Recipe {
  name: string;
  ingredients: string[];
  instructions: string;
}

export async function getRecipesForFood(foodItem: string, language: string = "English"): Promise<Recipe[]> {
  const prompt = `Generate 10 delicious recipes that primarily use "${foodItem}" as a key ingredient. 
  The recipes should be diverse and easy to follow. 
  Please respond in ${language}.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
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
            instructions: { type: Type.STRING, description: "Step-by-step cooking instructions" }
          },
          required: ["name", "ingredients", "instructions"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse recipes", e);
    return [];
  }
}
