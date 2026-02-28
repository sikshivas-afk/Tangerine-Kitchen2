import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Calendar, 
  Trash2, 
  ChefHat, 
  Bell, 
  Library, 
  Settings, 
  History, 
  Heart,
  LogOut,
  Search,
  Globe,
  ChevronRight,
  Loader2,
  X,
  Home,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInDays, parseISO, addDays } from 'date-fns';
import { getRecipesForFood, Recipe } from './services/geminiService';
import { User, PantryItem, LikedRecipe, LANGUAGES, cn } from './utils';
import ReactMarkdown from 'react-markdown';
import { GoogleGenAI } from "@google/genai";

// --- Components ---

const Tooltip = ({ text, children }: { text: string; children: React.ReactNode }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-orange-800 text-white text-xs rounded shadow-lg whitespace-nowrap z-50"
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const LanguageSelector = ({ selected, onSelect }: { selected: string; onSelect: (lang: string) => void }) => {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filtered = LANGUAGES.filter(l => l.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative w-full">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-white border border-[#FF7A00]/20 rounded-xl text-[#663300]"
      >
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4" />
          <span>{selected}</span>
        </div>
        <Search className="w-4 h-4 opacity-50" />
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white border border-[#FF7A00]/20 rounded-xl shadow-xl z-50 max-h-60 overflow-hidden flex flex-col"
          >
            <div className="p-2 border-bottom border-orange-100">
              <input 
                autoFocus
                type="text"
                placeholder="Search language..."
                className="w-full p-2 text-sm bg-[#FFF5EB] rounded-lg outline-none focus:ring-1 ring-[#FF7A00]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {filtered.map(lang => (
                <button
                  key={lang}
                  onClick={() => { onSelect(lang); setIsOpen(false); }}
                  className={cn(
                    "w-full text-left px-4 py-2 text-sm hover:bg-[#FFF5EB] transition-colors",
                    selected === lang && "bg-[#FFF5EB] font-bold text-[#FF7A00]"
                  )}
                >
                  {lang}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'pantry' | 'recipes' | 'library' | 'settings' | 'recents' | 'liked'>('pantry');
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [likedRecipes, setLikedRecipes] = useState<LikedRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFood, setActiveFood] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [showNotificationTray, setShowNotificationTray] = useState(false);

  // Auth States
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedLang, setSelectedLang] = useState('English');
  const [showGuestWarning, setShowGuestWarning] = useState(false);
  const [isSearchingLang, setIsSearchingLang] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const [translationCache, setTranslationCache] = useState<Record<string, any>>({});
  const [isTranslating, setIsTranslating] = useState(false);

  const ENGLISH_LABELS = {
    welcome: 'Welcome Back!',
    signInToManage: 'Sign in to manage your kitchen',
    login: 'Login',
    register: 'Register',
    emailLabel: 'Email Address',
    passwordLabel: 'Password',
    signInBtn: 'Sign In',
    createAccountBtn: 'Create Account',
    terms: 'By continuing, you agree to our Terms of Service',
    guest: 'Continue as Guest?',
    pantryTitle: 'Your Pantry',
    addNewItem: 'ADD NEW ITEM',
    addToPantry: 'ADD TO PANTRY',
    expires: 'Expires',
    getRecipes: 'Get Recipes',
    likedRecipes: 'Liked Recipes',
    library: 'Recipe Library',
    settings: 'Settings',
    appLanguage: 'App Language',
    accountInfo: 'Account Info',
    deleteAccount: 'DELETE ACCOUNT',
    backToPantry: 'Back to Pantry',
    recipesFor: 'Recipes for',
    ingredients: 'Ingredients',
    instructions: 'Instructions'
  };

  const [t, setT] = useState<any>(ENGLISH_LABELS);

  useEffect(() => {
    if (selectedLang === 'English') {
      setT(ENGLISH_LABELS);
      return;
    }

    if (translationCache[selectedLang]) {
      setT(translationCache[selectedLang]);
      return;
    }

    translateUI(selectedLang);
  }, [selectedLang]);

  const translateUI = async (lang: string) => {
    setIsTranslating(true);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    const prompt = `Translate the following UI labels into ${lang}. Return ONLY a JSON object with the same keys. 
    Base labels (English): ${JSON.stringify(ENGLISH_LABELS)}`;
    
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      const translated = JSON.parse(response.text || "{}");
      setT(translated);
      setTranslationCache(prev => ({ ...prev, [lang]: translated }));
    } catch (e) {
      console.error("Translation failed", e);
    } finally {
      setIsTranslating(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchPantry();
      fetchLiked();
    }
  }, [user]);

  useEffect(() => {
    checkExpiries();
  }, [pantry]);

  const fetchPantry = async () => {
    if (!user) return;
    const res = await fetch(`/api/pantry/${user.id}`);
    const data = await res.json();
    setPantry(data);
  };

  const fetchLiked = async () => {
    if (!user) return;
    const res = await fetch(`/api/liked/${user.id}`);
    const data = await res.json();
    setLikedRecipes(data);
  };

  const checkExpiries = () => {
    const alerts: string[] = [];
    pantry.forEach(item => {
      const daysLeft = differenceInDays(parseISO(item.expiry_date), new Date());
      if (daysLeft <= 7 && daysLeft >= 0) {
        alerts.push(`${item.name} expires in ${daysLeft === 0 ? 'today' : daysLeft + ' days'}!`);
      }
    });
    setNotifications(alerts);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, language: selectedLang })
    });
    const data = await res.json();
    if (res.ok) {
      setUser(data);
    } else {
      alert(data.error);
    }
  };

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const expiryDate = (form.elements.namedItem('expiry') as HTMLInputElement).value;
    
    if (!name || !expiryDate) return;

    await fetch('/api/pantry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user?.id, name, expiryDate })
    });
    form.reset();
    fetchPantry();
  };

  const deleteItem = async (id: number) => {
    await fetch(`/api/pantry/${id}`, { method: 'DELETE' });
    fetchPantry();
  };

  const loadRecipes = async (food: string) => {
    setLoading(true);
    setActiveFood(food);
    setView('recipes');
    const data = await getRecipesForFood(food, user?.language);
    setRecipes(data);
    setLoading(false);
  };

  const toggleLike = async (recipe: Recipe) => {
    const isLiked = likedRecipes.find(r => r.recipe_name === recipe.name);
    if (isLiked) {
      await fetch(`/api/liked/${isLiked.id}`, { method: 'DELETE' });
    } else {
      await fetch('/api/liked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          recipeName: recipe.name,
          recipeContent: JSON.stringify(recipe),
          foodItem: activeFood
        })
      });
    }
    fetchLiked();
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col md:flex-row bg-[#FFFAF5]">
        {/* Left Pane - Brand & Language */}
        <div className="md:w-1/2 bg-[#FF7A00] p-8 md:p-16 flex flex-col items-center justify-center text-center text-white space-y-8 relative overflow-hidden">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 max-w-md z-10"
          >
            <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mx-auto border border-white/30">
              <Home className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-5xl font-black tracking-tight">Tangerine Kitchen</h1>
            <p className="text-lg font-medium opacity-90 leading-relaxed">
              The vibrant way to track your pantry, reduce food waste, and discover delicious recipes tailored to what you have.
            </p>

            {/* Language Selection Box */}
            <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/20 space-y-4 mt-12 w-full max-w-sm">
              <p className="text-xs font-black uppercase tracking-widest opacity-80">Select Your Language</p>
              {!isSearchingLang ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {['English', 'Hindi', 'Telugu', 'Spanish'].map(lang => (
                      <button
                        key={lang}
                        onClick={() => setSelectedLang(lang)}
                        className={cn(
                          "py-3 rounded-xl font-bold transition-all text-sm",
                          selectedLang === lang 
                            ? "bg-white text-[#FF7A00] shadow-lg" 
                            : "bg-white/20 text-white hover:bg-white/30"
                        )}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={() => setIsSearchingLang(true)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-white/10 rounded-xl text-sm font-bold hover:bg-white/20 transition-all"
                  >
                    <span>More Languages...</span>
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <input 
                      autoFocus
                      type="text"
                      placeholder="Search any language..."
                      className="w-full p-3 bg-white/20 border border-white/30 rounded-xl outline-none text-white placeholder:text-white/50 text-sm font-bold"
                      value={langSearch}
                      onChange={(e) => setLangSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && langSearch) {
                          setSelectedLang(langSearch);
                          setIsSearchingLang(false);
                          setLangSearch('');
                        }
                      }}
                    />
                    <Search className="absolute right-3 top-3 w-4 h-4 opacity-50" />
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        if (langSearch) {
                          setSelectedLang(langSearch);
                          setIsSearchingLang(false);
                          setLangSearch('');
                        }
                      }}
                      className="flex-1 py-2 bg-white text-[#FF7A00] rounded-lg text-xs font-black"
                    >
                      APPLY
                    </button>
                    <button 
                      onClick={() => setIsSearchingLang(false)}
                      className="px-4 py-2 bg-white/10 text-white rounded-lg text-xs font-black"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
          
          {/* Decorative circles */}
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-black/5 rounded-full blur-3xl" />
        </div>

        {/* Right Pane - Auth Form */}
        <div className="md:w-1/2 p-8 md:p-16 flex flex-col items-center justify-center relative">
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-full max-w-sm space-y-8"
          >
            <div className="space-y-2 text-center md:text-left">
              <h2 className="text-4xl font-black text-[#663300]">{t.welcome}</h2>
              <p className="text-[#FF7A00] font-bold">{t.signInToManage}</p>
            </div>

            {/* Tabs */}
            <div className="flex bg-[#FFF5EB] p-1.5 rounded-2xl">
              <button 
                onClick={() => setIsLogin(true)}
                className={cn(
                  "flex-1 py-3 rounded-xl text-sm font-black transition-all",
                  isLogin ? "bg-white text-[#FF7A00] shadow-md" : "text-[#663300]/40 hover:text-[#FF7A00]"
                )}
              >
                {t.login}
              </button>
              <button 
                onClick={() => setIsLogin(false)}
                className={cn(
                  "flex-1 py-3 rounded-xl text-sm font-black transition-all",
                  !isLogin ? "bg-white text-[#FF7A00] shadow-md" : "text-[#663300]/40 hover:text-[#FF7A00]"
                )}
              >
                {t.register}
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-[#663300]/60 uppercase tracking-widest ml-1">{t.emailLabel}</label>
                <input 
                  required
                  type="email" 
                  placeholder="you@example.com"
                  className="w-full p-4 bg-white border border-[#FF7A00]/10 rounded-2xl outline-none focus:ring-2 ring-[#FF7A00]/30 shadow-sm transition-all text-[#663300]"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-[#663300]/60 uppercase tracking-widest ml-1">{t.passwordLabel}</label>
                <input 
                  required
                  type="password" 
                  placeholder="••••••••"
                  className="w-full p-4 bg-white border border-[#FF7A00]/10 rounded-2xl outline-none focus:ring-2 ring-[#FF7A00]/30 shadow-sm transition-all text-[#663300]"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              
              <button 
                type="submit"
                className="w-full py-4 bg-[#FF7A00] text-white font-black rounded-2xl shadow-xl shadow-orange-200 hover:bg-[#E66E00] active:scale-[0.98] transition-all"
              >
                {isLogin ? t.signInBtn : t.createAccountBtn}
              </button>

              <p className="text-center text-xs font-bold text-[#663300]/40">
                {t.terms}
              </p>
            </form>

            <button 
              type="button"
              onClick={() => setShowGuestWarning(true)}
              className="w-full py-2 text-[#FF7A00] font-bold text-xs hover:underline transition-all opacity-60"
            >
              {t.guest}
            </button>
          </motion.div>

          {/* Guest Warning Modal */}
          <AnimatePresence>
            {showGuestWarning && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm"
              >
                <motion.div 
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  className="bg-[#FF7A00] text-white p-8 rounded-[2rem] shadow-2xl text-center max-w-sm space-y-6 border-4 border-white/20"
                >
                  <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto">
                    <Bell className="w-8 h-8 text-white animate-bounce" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black">Account Required!</h3>
                    <p className="text-sm font-medium opacity-90 leading-relaxed">
                      To track your pantry and get AI-powered recipes, you must create a Tangerine Kitchen account. It's free and only takes a second!
                    </p>
                  </div>
                  <button 
                    onClick={() => setShowGuestWarning(false)}
                    className="w-full py-4 bg-white text-[#FF7A00] font-black rounded-2xl hover:bg-orange-50 transition-colors shadow-lg"
                  >
                    GOT IT!
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-orange-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-orange-50/80 backdrop-blur-md border-b border-orange-100 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 orange-gradient rounded-lg flex items-center justify-center">
            <ChefHat className="text-white w-5 h-5" />
          </div>
          <h2 className="font-black text-orange-600 text-xl">Tangerine Kitchen</h2>
        </div>
        
        <div className="flex items-center gap-3">
          {isTranslating && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-[10px] font-black text-[#FF7A00] uppercase tracking-widest bg-orange-100 px-3 py-1 rounded-full"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              Translating...
            </motion.div>
          )}
          <Tooltip text="Notifications">
            <button 
              onClick={() => setShowNotificationTray(!showNotificationTray)}
              className="relative p-2 text-orange-400 hover:text-orange-600 transition-colors"
            >
              <Bell className="w-6 h-6" />
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-orange-50">
                  {notifications.length}
                </span>
              )}
            </button>
          </Tooltip>
          <Tooltip text="Logout">
            <button onClick={() => setUser(null)} className="p-2 text-orange-400 hover:text-red-500 transition-colors">
              <LogOut className="w-6 h-6" />
            </button>
          </Tooltip>
        </div>
      </header>

      {/* Notification Tray */}
      <AnimatePresence>
        {showNotificationTray && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-16 right-4 left-4 md:left-auto md:w-80 bg-white border border-orange-200 rounded-2xl shadow-2xl z-50 p-4 space-y-3"
          >
            <div className="flex items-center justify-between border-b border-orange-100 pb-2">
              <h3 className="font-bold text-orange-600">Expiry Alerts</h3>
              <button onClick={() => setShowNotificationTray(false)}><X className="w-4 h-4 text-orange-300" /></button>
            </div>
            {notifications.length === 0 ? (
              <p className="text-sm text-orange-300 text-center py-4">No urgent notifications</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {notifications.map((n, i) => (
                  <div key={i} className="p-3 bg-orange-50 rounded-xl border border-orange-100 text-sm font-medium text-orange-700 flex gap-2">
                    <Bell className="w-4 h-4 text-orange-500 shrink-0" />
                    {n}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-4">
        {view === 'pantry' && (
          <div className="space-y-6">
            <form onSubmit={addItem} className="glass-card rounded-3xl p-6 space-y-4">
              <h3 className="font-black text-orange-600 text-lg flex items-center gap-2">
                <Plus className="w-5 h-5" /> {t.addNewItem}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input 
                  name="name"
                  required
                  placeholder="Food Item (e.g. Milk, Eggs)"
                  className="p-3 bg-orange-50 border border-orange-100 rounded-xl outline-none focus:ring-2 ring-orange-400"
                />
                <div className="relative">
                  <input 
                    name="expiry"
                    required
                    type="date"
                    className="w-full p-3 bg-orange-50 border border-orange-100 rounded-xl outline-none focus:ring-2 ring-orange-400"
                  />
                </div>
              </div>
              <button type="submit" className="w-full py-3 orange-gradient text-white font-bold rounded-xl shadow-lg">
                {t.addToPantry}
              </button>
            </form>

            <div className="space-y-4">
              <h3 className="font-black text-orange-600 text-lg uppercase tracking-wider">{t.pantryTitle}</h3>
              {pantry.length === 0 ? (
                <div className="text-center py-12 space-y-4">
                  <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                    <History className="w-10 h-10 text-orange-300" />
                  </div>
                  <p className="text-orange-300 font-medium">Your pantry is empty. Add something!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pantry.map(item => {
                    const daysLeft = differenceInDays(parseISO(item.expiry_date), new Date());
                    const isUrgent = daysLeft <= 7;
                    return (
                      <motion.div 
                        layout
                        key={item.id}
                        className={cn(
                          "glass-card rounded-2xl p-4 flex items-center justify-between border-l-4",
                          isUrgent ? "border-l-red-500" : "border-l-orange-400"
                        )}
                      >
                        <div className="space-y-1">
                          <h4 className="font-bold text-orange-800">{item.name}</h4>
                          <div className="flex items-center gap-2 text-xs font-medium">
                            <Calendar className="w-3 h-3 text-orange-400" />
                            <span className={cn(isUrgent ? "text-red-500" : "text-orange-400")}>
                              Expires: {format(parseISO(item.expiry_date), 'MMM dd, yyyy')}
                              {isUrgent && ` (${daysLeft === 0 ? 'Today' : daysLeft + ' days left'})`}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Tooltip text={t.getRecipes}>
                            <button 
                              onClick={() => loadRecipes(item.name)}
                              className="p-2 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 transition-colors"
                            >
                              <ChefHat className="w-5 h-5" />
                            </button>
                          </Tooltip>
                          <Tooltip text="Delete">
                            <button 
                              onClick={() => deleteItem(item.id)}
                              className="p-2 text-orange-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </Tooltip>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'recipes' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <button onClick={() => setView('pantry')} className="flex items-center gap-2 text-orange-500 font-bold hover:text-orange-700">
                <ChevronRight className="w-5 h-5 rotate-180" /> {t.backToPantry}
              </button>
              <h3 className="font-black text-orange-600 text-xl">{t.recipesFor} {activeFood}</h3>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
                <p className="text-orange-400 font-bold animate-pulse">Gemini is cooking up something special...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {recipes.map((recipe, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    key={idx} 
                    className="glass-card rounded-3xl overflow-hidden"
                  >
                    <div className="p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-2xl font-black text-orange-700">{recipe.name}</h4>
                        <button 
                          onClick={() => toggleLike(recipe)}
                          className={cn(
                            "p-2 rounded-full transition-all",
                            likedRecipes.find(r => r.recipe_name === recipe.name) 
                              ? "bg-red-50 text-red-500" 
                              : "bg-orange-50 text-orange-300 hover:text-red-400"
                          )}
                        >
                          <Heart className={cn("w-6 h-6", likedRecipes.find(r => r.recipe_name === recipe.name) && "fill-current")} />
                        </button>
                      </div>
                      
                      <div className="space-y-2">
                        <h5 className="font-bold text-orange-500 uppercase text-xs tracking-widest">{t.ingredients}</h5>
                        <div className="flex flex-wrap gap-2">
                          {recipe.ingredients.map((ing, i) => (
                            <span key={i} className="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">
                              {ing}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h5 className="font-bold text-orange-500 uppercase text-xs tracking-widest">{t.instructions}</h5>
                        <div className="prose prose-orange max-w-none text-orange-800 text-sm leading-relaxed">
                          <ReactMarkdown>{recipe.instructions}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'liked' && (
          <div className="space-y-6">
            <h3 className="font-black text-orange-600 text-xl uppercase tracking-wider">{t.likedRecipes}</h3>
            {likedRecipes.length === 0 ? (
              <div className="text-center py-20 space-y-4">
                <Heart className="w-16 h-16 text-orange-100 mx-auto" />
                <p className="text-orange-300 font-medium">No liked recipes yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {likedRecipes.map((liked, idx) => {
                  const recipe = JSON.parse(liked.recipe_content) as Recipe;
                  return (
                    <motion.div key={liked.id} className="glass-card rounded-3xl p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-2xl font-black text-orange-700">{recipe.name}</h4>
                          <p className="text-xs font-bold text-orange-400 uppercase">For: {liked.food_item}</p>
                        </div>
                        <button 
                          onClick={() => toggleLike(recipe)}
                          className="p-2 bg-red-50 text-red-500 rounded-full"
                        >
                          <Heart className="w-6 h-6 fill-current" />
                        </button>
                      </div>
                      <div className="prose prose-orange max-w-none text-orange-800 text-sm">
                        <ReactMarkdown>{recipe.instructions}</ReactMarkdown>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {view === 'library' && (
          <div className="space-y-6">
            <h3 className="font-black text-orange-600 text-xl uppercase tracking-wider">{t.library}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Desserts', 'Drinks'].map(cat => (
                <div key={cat} className="glass-card rounded-2xl p-6 flex flex-col items-center justify-center gap-3 hover:bg-orange-100 cursor-pointer transition-all group">
                  <div className="w-12 h-12 orange-gradient rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                    <Library className="text-white w-6 h-6" />
                  </div>
                  <span className="font-bold text-orange-700">{cat}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="space-y-6">
            <h3 className="font-black text-orange-600 text-xl uppercase tracking-wider">{t.settings}</h3>
            <div className="glass-card rounded-3xl p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-orange-500 uppercase">{t.appLanguage}</label>
                <LanguageSelector selected={user.language} onSelect={(l) => {
                  setUser({...user, language: l});
                  setSelectedLang(l);
                }} />
              </div>
              <div className="space-y-4">
                <label className="text-sm font-bold text-orange-500 uppercase">{t.accountInfo}</label>
                <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
                  <p className="text-xs text-orange-400 font-bold uppercase">{t.emailLabel}</p>
                  <p className="text-orange-700 font-medium">{user.email}</p>
                </div>
              </div>
              <button className="w-full py-3 border-2 border-orange-200 text-orange-400 font-bold rounded-xl hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-all">
                {t.deleteAccount}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Toolbar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-orange-100 px-6 py-3 flex items-center justify-between z-40">
        <Tooltip text={t.pantryTitle}>
          <button 
            onClick={() => setView('pantry')}
            className={cn("p-2 rounded-xl transition-all", view === 'pantry' ? "bg-orange-100 text-orange-600" : "text-orange-300")}
          >
            <History className="w-7 h-7" />
          </button>
        </Tooltip>
        <Tooltip text={t.library}>
          <button 
            onClick={() => setView('library')}
            className={cn("p-2 rounded-xl transition-all", view === 'library' ? "bg-orange-100 text-orange-600" : "text-orange-300")}
          >
            <Library className="w-7 h-7" />
          </button>
        </Tooltip>
        <Tooltip text={t.likedRecipes}>
          <button 
            onClick={() => setView('liked')}
            className={cn("p-2 rounded-xl transition-all", view === 'liked' ? "bg-orange-100 text-orange-600" : "text-orange-300")}
          >
            <Heart className="w-7 h-7" />
          </button>
        </Tooltip>
        <Tooltip text={t.settings}>
          <button 
            onClick={() => setView('settings')}
            className={cn("p-2 rounded-xl transition-all", view === 'settings' ? "bg-orange-100 text-orange-600" : "text-orange-300")}
          >
            <Settings className="w-7 h-7" />
          </button>
        </Tooltip>
      </nav>
    </div>
  );
}
