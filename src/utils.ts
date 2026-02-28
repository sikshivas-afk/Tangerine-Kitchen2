import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const LANGUAGES = [
  "English", "Spanish", "French", "German", "Chinese", "Japanese", "Korean", 
  "Hindi", "Arabic", "Portuguese", "Russian", "Italian", "Turkish", "Dutch", 
  "Polish", "Vietnamese", "Thai", "Indonesian", "Greek", "Hebrew"
];

export interface User {
  id: number;
  email: string;
  language: string;
}

export interface PantryItem {
  id: number;
  user_id: number;
  name: string;
  expiry_date: string;
  added_at: string;
}

export interface LikedRecipe {
  id: number;
  user_id: number;
  recipe_name: string;
  recipe_content: string;
  food_item: string;
  liked_at: string;
}
