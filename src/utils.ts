import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const LANGUAGES = [
  "Afrikaans", "Albanian", "Amharic", "Arabic", "Armenian", "Azerbaijani", 
  "Basque", "Belarusian", "Bengali", "Bosnian", "Bulgarian", "Catalan", 
  "Cebuano", "Chinese (Simplified)", "Chinese (Traditional)", "Croatian", 
  "Czech", "Danish", "Dutch", "English", "Esperanto", "Estonian", 
  "Finnish", "French", "Galician", "Georgian", "German", "Greek", 
  "Gujarati", "Haitian Creole", "Hausa", "Hawaiian", "Hebrew", "Hindi", 
  "Hmong", "Hungarian", "Icelandic", "Igbo", "Indonesian", "Irish", 
  "Italian", "Japanese", "Javanese", "Kannada", "Kazakh", "Khmer", 
  "Korean", "Kurdish", "Kyrgyz", "Lao", "Latin", "Latvian", 
  "Lithuanian", "Luxembourgish", "Macedonian", "Malagasy", "Malay", 
  "Malayalam", "Maltese", "Maori", "Marathi", "Mongolian", "Nepali", 
  "Norwegian", "Odia", "Pashto", "Persian", "Polish", "Portuguese", 
  "Punjabi", "Romanian", "Russian", "Samoan", "Serbian", "Shona", 
  "Sindhi", "Sinhala", "Slovak", "Slovenian", "Somali", "Spanish", 
  "Sundanese", "Swahili", "Swedish", "Tagalog", "Tajik", "Tamil", 
  "Telugu", "Thai", "Turkish", "Ukrainian", "Urdu", "Uzbek", 
  "Vietnamese", "Welsh", "Xhosa", "Yiddish", "Yoruba", "Zulu"
];

export interface User {
  id: number;
  email: string;
  language: string;
  reminderDays: number;
  notificationFrequency: 'daily' | 'once' | 'weekly';
}

export interface PantryItem {
  id: number;
  user_id: number;
  name: string;
  expiry_date: string;
  added_at: string;
  used_count: number;
  status: 'active' | 'consumed' | 'expired';
}

export interface LikedRecipe {
  id: number;
  user_id: number;
  recipe_name: string;
  recipe_content: string;
  food_item: string;
  liked_at: string;
}
