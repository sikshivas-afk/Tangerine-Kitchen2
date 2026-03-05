import React from 'react';
import { motion } from 'motion/react';
import { Heart, Youtube } from 'lucide-react';
import Markdown from 'react-markdown';
import { Recipe } from '../services/geminiService';
import { cn } from '../utils';

interface RecipeCardProps {
  recipe: Recipe;
  isLiked: boolean;
  onToggleLike: (recipe: Recipe) => void;
  foodItem?: string;
  translations: any;
}

export const RecipeCard: React.FC<RecipeCardProps> = ({ 
  recipe, 
  isLiked, 
  onToggleLike, 
  foodItem,
  translations: t 
}) => {
  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(recipe.name + ' recipe tutorial')}`;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-3xl overflow-hidden"
    >
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h4 className="text-2xl font-black text-orange-700">{recipe.name}</h4>
            {foodItem && (
              <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">For: {foodItem}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => onToggleLike(recipe)}
              className={cn(
                "p-2 rounded-full transition-all",
                isLiked 
                  ? "bg-red-50 text-red-500" 
                  : "bg-orange-50 text-orange-300 hover:text-red-400"
              )}
            >
              <Heart className={cn("w-6 h-6", isLiked && "fill-current")} />
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <a 
            href={youtubeSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-3 bg-red-600 hover:bg-red-700 text-white font-black py-4 px-6 rounded-2xl transition-all shadow-lg shadow-red-200 group"
          >
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
              <Youtube className="w-5 h-5 text-white" />
            </div>
            <span className="uppercase tracking-wider text-sm">Watch Tutorial on YouTube</span>
          </a>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <h5 className="font-bold text-orange-500 uppercase text-xs tracking-widest flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
              {t.ingredients}
            </h5>
            <div className="flex flex-wrap gap-2">
              {recipe.ingredients.map((ing, i) => (
                <span key={i} className="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">
                  {ing}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h5 className="font-bold text-orange-500 uppercase text-xs tracking-widest flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
              {t.instructions}
            </h5>
            <div className="markdown-body prose prose-orange max-w-none text-orange-800 text-sm leading-relaxed">
              <Markdown>{recipe.instructions}</Markdown>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
