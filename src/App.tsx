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
  ChevronDown,
  Utensils,
  BarChart3,
  Activity,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInDays, parseISO, addDays, isBefore, startOfDay } from 'date-fns';
import { getRecipesForFood, Recipe, validateFoodItem, translateFoodItems } from './services/geminiService';
import { RecipeCard } from './components/RecipeCard';
import { User, PantryItem, LikedRecipe, LANGUAGES, cn } from './utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import ReactMarkdown from 'react-markdown';
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

// --- Helpers ---

const getYouTubeEmbedUrl = (url: string) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
};

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
  const [view, setView] = useState<'pantry' | 'recipes' | 'library' | 'settings' | 'recents' | 'liked' | 'progress'>('pantry');
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [likedRecipes, setLikedRecipes] = useState<LikedRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFood, setActiveFood] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [inputWarning, setInputWarning] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [showNotificationTray, setShowNotificationTray] = useState(false);

  // Auth States
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedLang, setSelectedLang] = useState('English');
  const [authError, setAuthError] = useState<string | null>(null);
  const [showGuestWarning, setShowGuestWarning] = useState(false);
  const [isSearchingLang, setIsSearchingLang] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const [translationCache, setTranslationCache] = useState<Record<string, any>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const notifiedItems = React.useRef<Set<number>>(new Set());

  useEffect(() => {
    if (typeof window !== 'undefined' && "Notification" in window) {
      setNotificationsEnabled(Notification.permission === "granted");
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
  };

  // Persistence
  useEffect(() => {
    const savedUser = localStorage.getItem('tangerine_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        if (parsed.language) setSelectedLang(parsed.language);
      } catch (e) {
        localStorage.removeItem('tangerine_user');
      }
    }
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem('tangerine_user', JSON.stringify(user));
      if (user.language) setSelectedLang(user.language);
    } else {
      localStorage.removeItem('tangerine_user');
    }
  }, [user]);

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
    instructions: 'Instructions',
    reminderSettings: 'Reminder Settings',
    reminderDaysLabel: 'Notify me when items expire in (days)',
    enableNotifications: 'Enable Browser Notifications',
    progressTitle: 'Your Progress',
    usedBeforeExpiry: 'Used Before Expiry',
    expiredUnused: 'Expired Unused',
    usageStats: 'Usage Statistics',
    daysLeft: 'days left',
    expiresToday: 'Expires today!',
    expired: 'Expired',
    markAsUsed: 'Mark as Used',
    timesUsed: 'Times used',
    pantryHealth: 'Pantry Health',
    foodSpoiled: 'Food Spoiled',
    notificationFrequency: 'Notification Frequency',
    daily: 'Daily',
    once: 'Once',
    weekly: 'Weekly'
  };

  const PRESET_TRANSLATIONS: Record<string, any> = {
    'English': ENGLISH_LABELS,
    'Hindi': {
      welcome: 'नमस्ते!',
      signInToManage: 'अपनी रसोई प्रबंधित करने के लिए साइन इन करें',
      login: 'लॉगिन',
      register: 'पंजीकरण',
      emailLabel: 'ईमेल पता',
      passwordLabel: 'पासवर्ड',
      signInBtn: 'साइन इन करें',
      createAccountBtn: 'खाता बनाएं',
      terms: 'जारी रखकर, आप हमारी सेवा की शर्तों से सहमत हैं',
      guest: 'अतिथि के रूप में जारी रखें?',
      pantryTitle: 'आपकी पेंट्री',
      addNewItem: 'नई वस्तु जोड़ें',
      addToPantry: 'पेंट्री में जोड़ें',
      expires: 'समाप्ति',
      getRecipes: 'व्यंजन प्राप्त करें',
      likedRecipes: 'पसंद किए गए व्यंजन',
      library: 'व्यंजन पुस्तकालय',
      settings: 'सेटिंग्स',
      appLanguage: 'ऐप की भाषा',
      accountInfo: 'खाता जानकारी',
      deleteAccount: 'खाता हटाएं',
      backToPantry: 'पेंट्री पर वापस जाएं',
      recipesFor: 'के लिए व्यंजन',
      ingredients: 'सामग्री',
      instructions: 'निर्देश',
      reminderSettings: 'अनुस्मारक सेटिंग्स',
      reminderDaysLabel: 'वस्तुओं की समाप्ति पर मुझे सूचित करें (दिन)',
      enableNotifications: 'ब्राउज़र सूचनाएं सक्षम करें',
      foodSpoiled: 'खाना खराब हो गया',
      daysLeft: 'दिन शेष',
      expiresToday: 'आज समाप्त हो रहा है!',
      markAsUsed: 'उपयोग किया गया चिह्नित करें',
      timesUsed: 'उपयोग की संख्या',
      pantryHealth: 'पेंट्री स्वास्थ्य',
      notificationFrequency: 'सूचना आवृत्ति',
      daily: 'दैनिक',
      once: 'एक बार',
      weekly: 'साप्ताहिक'
    },
    'Telugu': {
      welcome: 'స్వాగతం!',
      signInToManage: 'మీ వంటగదిని నిర్వహించడానికి సైన్ ఇన్ చేయండి',
      login: 'లాగిన్',
      register: 'నమోదు',
      emailLabel: 'ఈమెయిల్ చిరునామా',
      passwordLabel: 'పాస్‌వర్డ్',
      signInBtn: 'సైన్ ఇన్',
      createAccountBtn: 'ఖాతాను సృష్టించండి',
      terms: 'కొనసాగడం ద్వారా, మీరు మా సేవా నిబంధనలకు అంగీకరిస్తున్నారు',
      guest: 'అతిథిగా కొనసాగాలా?',
      pantryTitle: 'మీ పాంట్రీ',
      addNewItem: 'కొత్త వస్తువును జోడించండి',
      addToPantry: 'పాంట్రీకి జోడించండి',
      expires: 'గడువు',
      getRecipes: 'వంటకాలను పొందండి',
      likedRecipes: 'నచ్చిన వంటకాలు',
      library: 'వంటకాల లైబ్రరీ',
      settings: 'సెట్టింగులు',
      appLanguage: 'యాప్ భాష',
      accountInfo: 'ఖాతా సమాచారం',
      deleteAccount: 'ఖాతాను తొలగించు',
      backToPantry: 'పాంట్రీకి తిరిగి వెళ్ళు',
      recipesFor: 'కోసం వంటకాలు',
      ingredients: 'కావలసినవి',
      instructions: 'సూచనలు',
      reminderSettings: 'రిమైండర్ సెట్టింగులు',
      reminderDaysLabel: 'వస్తువుల గడువు ముగిసినప్పుడు నాకు తెలియజేయండి (రోజులు)',
      enableNotifications: 'బ్రౌజర్ నోటిఫికేషన్‌లను ప్రారంభించండి',
      foodSpoiled: 'ఆహారం పాడైపోయింది',
      daysLeft: 'రోజులు మిగిలి ఉన్నాయి',
      expiresToday: 'ఈరోజే గడువు ముగుస్తుంది!',
      markAsUsed: 'ఉపయోగించినట్లు గుర్తించండి',
      timesUsed: 'ఉపయోగించిన సార్లు',
      pantryHealth: 'పాంట్రీ ఆరోగ్యం',
      notificationFrequency: 'నోటిఫికేషన్ ఫ్రీక్వెన్సీ',
      daily: 'రోజువారీ',
      once: 'ఒకసారి',
      weekly: 'వారానికోసారి'
    },
    'Spanish': {
      welcome: '¡Bienvenido de nuevo!',
      signInToManage: 'Inicia sesión para gestionar tu cocina',
      login: 'Acceso',
      register: 'Registro',
      emailLabel: 'Correo electrónico',
      passwordLabel: 'Contraseña',
      signInBtn: 'Iniciar sesión',
      createAccountBtn: 'Crear cuenta',
      terms: 'Al continuar, aceptas nuestros Términos de servicio',
      guest: '¿Continuar como invitado?',
      pantryTitle: 'Tu despensa',
      addNewItem: 'AGREGAR ARTÍCULO',
      addToPantry: 'AGREGAR A LA DESPENSA',
      expires: 'Expira',
      getRecipes: 'Obtener recetas',
      likedRecipes: 'Recetas favoritas',
      library: 'Biblioteca de recetas',
      settings: 'Ajustes',
      appLanguage: 'Idioma de la aplicación',
      accountInfo: 'Información de la cuenta',
      deleteAccount: 'ELIMINAR CUENTA',
      backToPantry: 'Volver a la despensa',
      recipesFor: 'Recetas para',
      ingredients: 'Ingredientes',
      instructions: 'Instrucciones',
      reminderSettings: 'Configuración de recordatorios',
      reminderDaysLabel: 'Notificarme cuando los artículos expiren en (días)',
      enableNotifications: 'Habilitar notificaciones del navegador',
      foodSpoiled: 'Comida estropeada',
      daysLeft: 'días restantes',
      expiresToday: '¡Expira hoy!',
      markAsUsed: 'Marcar como usado',
      timesUsed: 'Veces usado',
      pantryHealth: 'Salud de la despensa',
      notificationFrequency: 'Frecuencia de notificación',
      daily: 'Diario',
      once: 'Una vez',
      weekly: 'Semanal'
    },
    'French': {
      welcome: 'Bon retour !',
      signInToManage: 'Connectez-vous pour gérer votre cuisine',
      login: 'Connexion',
      register: 'S\'inscrire',
      emailLabel: 'Adresse e-mail',
      passwordLabel: 'Mot de passe',
      signInBtn: 'Se connecter',
      createAccountBtn: 'Créer un compte',
      terms: 'En continuant, vous acceptez nos conditions d\'utilisation',
      guest: 'Continuer en tant qu\'invité ?',
      pantryTitle: 'Votre garde-manger',
      addNewItem: 'AJOUTER UN ARTICLE',
      addToPantry: 'AJOUTER AU GARDE-MANGER',
      expires: 'Expire le',
      getRecipes: 'Obtenir des recettes',
      likedRecipes: 'Recettes aimées',
      library: 'Bibliothèque de recettes',
      settings: 'Paramètres',
      appLanguage: 'Langue de l\'application',
      accountInfo: 'Infos compte',
      deleteAccount: 'SUPPRIMER LE COMPTE',
      backToPantry: 'Retour au garde-manger',
      recipesFor: 'Recettes pour',
      ingredients: 'Ingrédients',
      instructions: 'Instructions',
      reminderSettings: 'Paramètres de rappel',
      reminderDaysLabel: 'M\'avertir quand les articles expirent dans (jours)',
      enableNotifications: 'Activer les notifications du navegador',
      foodSpoiled: 'Nourriture gâtée',
      daysLeft: 'jours restants',
      expiresToday: 'Expire aujourd\'hui !',
      markAsUsed: 'Marquer comme utilisé',
      timesUsed: 'Fois utilisé',
      pantryHealth: 'Santé du garde-manger',
      notificationFrequency: 'Fréquence de notification',
      daily: 'Quotidien',
      once: 'Une fois',
      weekly: 'Hebdomadaire'
    },
    'German': {
      welcome: 'Willkommen zurück!',
      signInToManage: 'Anmelden, um Ihre Küche zu verwalten',
      login: 'Login',
      register: 'Registrieren',
      emailLabel: 'E-Mail-Adresse',
      passwordLabel: 'Passwort',
      signInBtn: 'Anmelden',
      createAccountBtn: 'Konto erstellen',
      terms: 'Mit dem Fortfahren akzeptieren Sie unsere Nutzungsbedingungen',
      guest: 'Als Gast fortfahren?',
      pantryTitle: 'Ihre Vorratskammer',
      addNewItem: 'NEUEN ARTIKEL HINZUFÜGEN',
      addToPantry: 'ZUR VORRATSKAMMER HINZUFÜGEN',
      expires: 'Läuft ab',
      getRecipes: 'Rezepte erhalten',
      likedRecipes: 'Gefällt mir Rezepte',
      library: 'Rezeptbibliothek',
      settings: 'Einstellungen',
      appLanguage: 'App-Sprache',
      accountInfo: 'Kontoinformationen',
      deleteAccount: 'KONTO LÖSCHEN',
      backToPantry: 'Zurück zur Vorratskammer',
      recipesFor: 'Rezepte für',
      ingredients: 'Zutaten',
      instructions: 'Anweisungen',
      foodSpoiled: 'Lebensmittel verdorben',
      daysLeft: 'Tage übrig',
      expiresToday: 'Läuft heute ab!',
      markAsUsed: 'Als verwendet markieren',
      timesUsed: 'Häufigkeit der Nutzung',
      pantryHealth: 'Vorratskammer-Zustand',
      notificationFrequency: 'Benachrichtigungshäufigkeit',
      daily: 'Täglich',
      once: 'Einmal',
      weekly: 'Wöchentlich'
    },
    'Chinese (Simplified)': {
      welcome: '欢迎回来！',
      signInToManage: '登录以管理您的厨房',
      login: '登录',
      register: '注册',
      emailLabel: '电子邮件',
      passwordLabel: '密码',
      signInBtn: '登录',
      createAccountBtn: '创建账户',
      terms: '继续即表示您接受我们的服务条款',
      guest: '以访客身份继续？',
      pantryTitle: '您的食品柜',
      addNewItem: '添加物品',
      addToPantry: '添加到食品柜',
      expires: '过期时间',
      getRecipes: '获取食谱',
      likedRecipes: '收藏的食谱',
      library: '食谱库',
      settings: '设置',
      appLanguage: '应用语言',
      accountInfo: '账户信息',
      deleteAccount: '删除账户',
      backToPantry: '返回食品柜',
      recipesFor: '食谱：',
      ingredients: '配料',
      instructions: '步骤',
      foodSpoiled: '食物变质',
      daysLeft: '天剩余',
      expiresToday: '今天过期！',
      markAsUsed: '标记为已使用',
      timesUsed: '使用次数',
      pantryHealth: '食品柜健康',
      notificationFrequency: '通知频率',
      daily: '每天',
      once: '一次',
      weekly: '每周'
    },
    'Japanese': {
      welcome: 'おかえりなさい！',
      signInToManage: 'キッチンを管理するためにログインしてください',
      login: 'ログイン',
      register: '登録',
      emailLabel: 'メールアドレス',
      passwordLabel: 'パスワード',
      signInBtn: 'ログイン',
      createAccountBtn: 'アカウント作成',
      terms: '続行することで、利用規約に同意したことになります',
      guest: 'ゲストとして続行しますか？',
      pantryTitle: 'あなたのパントリー',
      addNewItem: 'アイテムを追加',
      addToPantry: 'パントリーに追加',
      expires: '期限',
      getRecipes: 'レシピを取得',
      likedRecipes: 'お気に入りレシピ',
      library: 'レシピライブラリ',
      settings: '設定',
      appLanguage: 'アプリの言語',
      accountInfo: 'アカウント情報',
      deleteAccount: 'アカウント削除',
      backToPantry: 'パントリーに戻る',
      recipesFor: 'レシピ：',
      ingredients: '材料',
      instructions: '作り方',
      foodSpoiled: '食べ物が腐っています',
      daysLeft: '日残り',
      expiresToday: '今日期限です！',
      markAsUsed: '使用済みとしてマーク',
      timesUsed: '使用回数',
      pantryHealth: 'パントリーの健康',
      notificationFrequency: '通知頻度',
      daily: '毎日',
      once: '一度だけ',
      weekly: '毎週'
    },
    'Arabic': {
      welcome: 'مرحباً بعودتك!',
      signInToManage: 'سجل الدخول لإدارة مطبخك',
      login: 'تسجيل الدخول',
      register: 'تسجيل',
      emailLabel: 'البريد الإلكتروني',
      passwordLabel: 'كلمة المرور',
      signInBtn: 'دخول',
      createAccountBtn: 'إنشاء حساب',
      terms: 'بالمتابعة، أنت توافق على شروط الخدمة الخاصة بنا',
      guest: 'المتابعة كضيف؟',
      pantryTitle: 'خزانة طعامك',
      addNewItem: 'إضافة عنصر',
      addToPantry: 'أضف إلى الخزانة',
      expires: 'تنتهي الصلاحية',
      getRecipes: 'احصل على وصفات',
      likedRecipes: 'الوصفات المفضلة',
      library: 'مكتبة الوصفات',
      settings: 'الإعدادات',
      appLanguage: 'لغة التطبيق',
      accountInfo: 'معلومات الحساب',
      deleteAccount: 'حذف الحساب',
      backToPantry: 'العودة للخزانة',
      recipesFor: 'وصفات لـ',
      ingredients: 'المكونات',
      instructions: 'التعليمات',
      foodSpoiled: 'طعام فاسد',
      daysLeft: 'أيام متبقية',
      expiresToday: 'تنتهي اليوم!',
      markAsUsed: 'تحديد كمستخدم',
      timesUsed: 'مرات الاستخدام',
      pantryHealth: 'صحة الخزانة',
      notificationFrequency: 'تردد الإشعارات',
      daily: 'يومي',
      once: 'مرة واحدة',
      weekly: 'أسبوعي'
    },
    'Portuguese': {
      welcome: 'Bem-vindo de volta!',
      signInToManage: 'Faça login para gerenciar sua cozinha',
      login: 'Entrar',
      register: 'Registrar',
      emailLabel: 'E-mail',
      passwordLabel: 'Senha',
      signInBtn: 'Entrar',
      createAccountBtn: 'Criar conta',
      terms: 'Ao continuar, você aceita nossos Termos de Serviço',
      guest: 'Continuar como convidado?',
      pantryTitle: 'Sua despensa',
      addNewItem: 'ADICIONAR ITEM',
      addToPantry: 'ADICIONAR À DESPENSA',
      expires: 'Expira em',
      getRecipes: 'Obter receitas',
      likedRecipes: 'Receitas favoritas',
      library: 'Biblioteca de receitas',
      settings: 'Configurações',
      appLanguage: 'Idioma do aplicativo',
      accountInfo: 'Informações da conta',
      deleteAccount: 'EXCLUIR CONTA',
      backToPantry: 'Voltar para a despensa',
      recipesFor: 'Receitas para',
      ingredients: 'Ingredientes',
      instructions: 'Instruções',
      foodSpoiled: 'Comida estragada',
      daysLeft: 'dias restantes',
      expiresToday: 'Expira hoje!',
      markAsUsed: 'Marcar como usado',
      timesUsed: 'Vezes usado',
      pantryHealth: 'Saúde da despensa',
      notificationFrequency: 'Frequência de notificação',
      daily: 'Diário',
      once: 'Uma vez',
      weekly: 'Semanal'
    }
  };

  const [t, setT] = useState<any>(ENGLISH_LABELS);

  useEffect(() => {
    if (PRESET_TRANSLATIONS[selectedLang]) {
      setT(PRESET_TRANSLATIONS[selectedLang]);
      return;
    }

    if (translationCache[selectedLang]) {
      setT(translationCache[selectedLang]);
      return;
    }

    translateUI(selectedLang);
  }, [selectedLang]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (langSearch.length > 2 && !PRESET_TRANSLATIONS[langSearch] && !translationCache[langSearch]) {
        translateUI(langSearch, true); // Silent pre-fetch
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [langSearch]);

  const translateUI = async (lang: string, silent: boolean = false) => {
    if (!silent) setIsTranslating(true);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    const prompt = `Translate these UI labels to ${lang}. Return ONLY JSON.
    Labels: ${JSON.stringify(ENGLISH_LABELS)}`;
    
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { 
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          temperature: 0.1
        }
      });
      const translated = JSON.parse(response.text || "{}");
      if (!silent) setT(translated);
      setTranslationCache(prev => ({ ...prev, [lang]: translated }));
    } catch (e) {
      console.error("Translation failed", e);
    } finally {
      if (!silent) setIsTranslating(false);
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
    const interval = setInterval(checkExpiries, 1000 * 60 * 60); // Check every hour
    return () => clearInterval(interval);
  }, [pantry, user?.reminderDays, user?.notificationFrequency]);

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
    if (!user) return;
    const alerts: string[] = [];
    const reminderDays = user.reminderDays ?? 7;
    const frequency = user.notificationFrequency || 'daily';
    
    pantry.forEach(item => {
      const daysLeft = differenceInDays(parseISO(item.expiry_date), startOfDay(new Date()));
      if (daysLeft <= reminderDays && daysLeft >= 0) {
        const message = `${item.name} expires in ${daysLeft === 0 ? 'today' : daysLeft + ' days'}!`;
        
        // Frequency logic
        let shouldNotify = false;
        if (frequency === 'daily') {
          shouldNotify = !notifiedItems.current.has(item.id);
        } else if (frequency === 'once') {
          // In a real app, we'd check DB. Here we use session-based notifiedItems
          shouldNotify = !notifiedItems.current.has(item.id);
        } else if (frequency === 'weekly') {
          // Simplified: notify if daysLeft is a multiple of 7 or exactly reminderDays
          shouldNotify = !notifiedItems.current.has(item.id) && (daysLeft % 7 === 0 || daysLeft === reminderDays);
        }

        if (shouldNotify) {
          alerts.push(message);
          if (notificationsEnabled && Notification.permission === "granted") {
            new Notification("Tangerine Kitchen", {
              body: message,
              icon: "/favicon.ico"
            });
            notifiedItems.current.add(item.id);
          }
        }
      }
    });
    setNotifications(prev => [...new Set([...prev, ...alerts])]);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, language: selectedLang })
      });
      
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await res.json();
        if (res.ok) {
          setUser(data);
        } else {
          setAuthError(data.error || "Authentication failed");
        }
      } else {
        const text = await res.text();
        console.error("Non-JSON response:", text);
        setAuthError("Server error. Please try again later.");
      }
    } catch (err) {
      console.error("Auth error:", err);
      setAuthError("Network error. Please check your connection.");
    }
  };

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const nameInput = (form.elements.namedItem('name') as HTMLInputElement).value;
    const expiryDate = (form.elements.namedItem('expiry') as HTMLInputElement).value;
    
    if (!nameInput || !expiryDate) return;

    let name = nameInput;
    if (selectedLang !== 'English') {
      try {
        const translated = await translateFoodItems([nameInput], selectedLang);
        if (translated && translated[0]) {
          name = translated[0];
        }
      } catch (e) {
        console.error("Failed to translate new item", e);
      }
    }

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
    setInputWarning(null);
    setActiveFood(food);
    
    // Validate food item
    const isValid = await validateFoodItem(food);
    if (!isValid) {
      setInputWarning("Please enter a valid food item");
      setLoading(false);
      return;
    }

    setView('recipes');
    
    try {
      const recipesData = await getRecipesForFood(food, user?.language);
      setRecipes(recipesData);
    } catch (error) {
      console.error("Error loading recipes:", error);
    } finally {
      setLoading(false);
    }
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

  const handleLanguageChange = async (newLang: string) => {
    if (!user) return;
    setIsTranslating(true);
    try {
      // Translate pantry items
      if (pantry.length > 0) {
        const names = pantry.map(i => i.name);
        const translatedNames = await translateFoodItems(names, newLang);
        const newPantry = pantry.map((item, idx) => ({
          ...item,
          name: translatedNames[idx] || item.name
        }));
        setPantry(newPantry);
        await fetch(`/api/pantry/bulk-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: newPantry })
        });
      }

      setUser({ ...user, language: newLang });
      setSelectedLang(newLang);
      await fetch(`/api/user/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: newLang })
      });
    } catch (e) {
      console.error("Language change failed", e);
    } finally {
      setIsTranslating(false);
    }
  };

  const markItemAsUsed = async (itemId: number) => {
    const updatedPantry = pantry.map(item => {
      if (item.id === itemId) {
        return { ...item, used_count: (item.used_count || 0) + 1 };
      }
      return item;
    });
    setPantry(updatedPantry);
    await fetch(`/api/pantry/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ used_count: updatedPantry.find(i => i.id === itemId)?.used_count })
    });
  };

  const consumeItem = async (itemId: number) => {
    const updatedPantry = pantry.map(item => {
      if (item.id === itemId) {
        return { ...item, status: 'consumed' as const };
      }
      return item;
    });
    setPantry(updatedPantry);
    await fetch(`/api/pantry/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'consumed' })
    });
  };

  const ProgressView = () => {
    const usedBeforeExpiry = pantry.filter(i => i.status === 'consumed' || (i.status === 'active' && i.used_count > 0)).length;
    const expiredUnused = pantry.filter(i => i.status === 'expired' && (i.used_count || 0) === 0).length;
    
    const data = [
      { name: t.usedBeforeExpiry, value: usedBeforeExpiry, color: '#10b981' },
      { name: t.expiredUnused, value: expiredUnused, color: '#ef4444' },
    ];

    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-orange-600 text-xl uppercase tracking-wider">{t.progressTitle}</h3>
          <div className="orange-gradient p-2 rounded-xl shadow-lg">
            <Activity className="text-white w-6 h-6" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="glass-card p-6 rounded-3xl text-center space-y-2">
            <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">{t.usedBeforeExpiry}</p>
            <p className="text-4xl font-black text-emerald-500">{usedBeforeExpiry}</p>
          </div>
          <div className="glass-card p-6 rounded-3xl text-center space-y-2">
            <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">{t.expiredUnused}</p>
            <p className="text-4xl font-black text-red-500">{expiredUnused}</p>
          </div>
        </div>

        <div className="glass-card p-8 rounded-[2.5rem] h-[400px]">
          <p className="text-sm font-black text-orange-600 uppercase tracking-widest mb-8 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            {t.usageStats}
          </p>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#fed7aa" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#ea580c', fontSize: 12, fontWeight: 700 }}
                dy={10}
              />
              <YAxis hide />
              <RechartsTooltip 
                cursor={{ fill: '#fff7ed' }}
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="value" radius={[12, 12, 0, 0]} barSize={60}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-6 rounded-3xl space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-orange-600 uppercase tracking-widest">{t.pantryHealth}</p>
            <span className="text-xs font-bold text-orange-400">
              {Math.round((usedBeforeExpiry / (usedBeforeExpiry + expiredUnused || 1)) * 100)}% Efficiency
            </span>
          </div>
          <div className="h-4 bg-orange-100 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${(usedBeforeExpiry / (usedBeforeExpiry + expiredUnused || 1)) * 100}%` }}
              className="h-full orange-gradient"
            />
          </div>
        </div>
      </div>
    );
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
              
              <div className="h-64 overflow-y-auto pr-2 custom-scrollbar space-y-2 text-left">
                {LANGUAGES.filter(l => l.toLowerCase().includes(langSearch.toLowerCase())).map(lang => (
                  <button
                    key={lang}
                    onClick={() => setSelectedLang(lang)}
                    className={cn(
                      "w-full py-2.5 px-4 rounded-xl font-bold transition-all text-sm text-left flex items-center justify-between",
                      selectedLang === lang 
                        ? "bg-white text-[#FF7A00] shadow-lg" 
                        : "bg-white/20 text-white hover:bg-white/30"
                    )}
                  >
                    <span>{lang}</span>
                    {selectedLang === lang && <div className="w-2 h-2 bg-[#FF7A00] rounded-full" />}
                  </button>
                ))}
              </div>

              <div className="relative pt-2 border-t border-white/10">
                <input 
                  type="text"
                  placeholder="Search languages..."
                  className="w-full p-3 bg-white/20 border border-white/30 rounded-xl outline-none text-white placeholder:text-white/50 text-sm font-bold"
                  value={langSearch}
                  onChange={(e) => setLangSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && langSearch) {
                      setSelectedLang(langSearch);
                      setLangSearch('');
                    }
                  }}
                />
                <Search className="absolute right-3 top-5 w-4 h-4 opacity-50" />
              </div>
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
                onClick={() => { setIsLogin(true); setAuthError(null); }}
                className={cn(
                  "flex-1 py-3 rounded-xl text-sm font-black transition-all",
                  isLogin ? "bg-white text-[#FF7A00] shadow-md" : "text-[#663300]/40 hover:text-[#FF7A00]"
                )}
              >
                {t.login}
              </button>
              <button 
                onClick={() => { setIsLogin(false); setAuthError(null); }}
                className={cn(
                  "flex-1 py-3 rounded-xl text-sm font-black transition-all",
                  !isLogin ? "bg-white text-[#FF7A00] shadow-md" : "text-[#663300]/40 hover:text-[#FF7A00]"
                )}
              >
                {t.register}
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-6">
              <AnimatePresence mode="wait">
                {authError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-2xl text-xs font-bold flex items-center gap-3"
                  >
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" />
                    <p>{authError}</p>
                  </motion.div>
                )}
              </AnimatePresence>

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
          <div className="flex flex-col">
            <h2 className="font-black text-orange-600 text-xl leading-none">Tangerine Kitchen</h2>
          </div>
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

            <div className="glass-card rounded-3xl p-6 space-y-4">
              <h3 className="font-black text-orange-600 text-lg flex items-center gap-2">
                <Search className="w-5 h-5" /> Quick Recipe Search
              </h3>
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Enter a food item to find recipes..."
                  className="w-full p-3 bg-orange-50 border border-orange-100 rounded-xl outline-none focus:ring-2 ring-orange-400"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      loadRecipes((e.target as HTMLInputElement).value);
                    }
                  }}
                />
                <button 
                  onClick={(e) => {
                    const input = e.currentTarget.parentElement?.querySelector('input');
                    if (input?.value) loadRecipes(input.value);
                  }}
                  className="absolute right-2 top-2 p-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              {inputWarning && (
                <motion.p 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="text-red-500 text-sm font-bold flex items-center gap-1"
                >
                  <X className="w-4 h-4" /> {inputWarning}
                </motion.p>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-orange-600 text-lg uppercase tracking-wider">{t.pantryTitle}</h3>
                <button 
                  onClick={() => setView('progress')}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-600 rounded-xl font-bold text-sm hover:bg-orange-200 transition-all"
                >
                  <BarChart3 className="w-4 h-4" />
                  {t.progressTitle}
                </button>
              </div>
              {pantry.filter(i => i.status === 'active').length === 0 ? (
                <div className="text-center py-12 space-y-4">
                  <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                    <History className="w-10 h-10 text-orange-300" />
                  </div>
                  <p className="text-orange-300 font-medium">Your pantry is empty. Add something!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pantry.filter(i => i.status === 'active').map(item => {
                    const daysLeft = differenceInDays(parseISO(item.expiry_date), startOfDay(new Date()));
                    const isUrgent = daysLeft <= (user.reminderDays ?? 7);
                    return (
                      <motion.div 
                        layout
                        key={item.id}
                        className={cn(
                          "glass-card rounded-2xl p-4 flex items-center justify-between border-l-4 transition-all",
                          isUrgent ? "border-l-red-500 bg-red-50/30" : "border-l-orange-400"
                        )}
                      >
                        <div className="space-y-1">
                          <h4 className="font-bold text-orange-800">{item.name}</h4>
                          <div className="flex items-center gap-2 text-xs font-medium">
                            <Clock className={cn("w-3 h-3", isUrgent ? "text-red-500" : "text-orange-400")} />
                            <span className={cn(isUrgent ? "text-red-500" : "text-orange-400")}>
                              {daysLeft < 0 ? t.foodSpoiled : daysLeft === 0 ? t.expiresToday : `${daysLeft} ${t.daysLeft}`}
                            </span>
                          </div>
                          <p className="text-[10px] font-bold text-orange-300 uppercase">
                            {t.timesUsed}: {item.used_count || 0}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Tooltip text={t.markAsUsed}>
                            <button 
                              onClick={() => markItemAsUsed(item.id)}
                              className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </Tooltip>
                          <Tooltip text={t.getRecipes}>
                            <button 
                              onClick={() => loadRecipes(item.name)}
                              className="p-2 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 transition-colors"
                            >
                              <ChefHat className="w-5 h-5" />
                            </button>
                          </Tooltip>
                          <Tooltip text="Consume">
                            <button 
                              onClick={() => consumeItem(item.id)}
                              className="p-2 text-orange-300 hover:text-red-500 transition-colors"
                            >
                              <CheckCircle2 className="w-5 h-5" />
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

        {view === 'progress' && <ProgressView />}

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
            ) : recipes.length === 0 ? (
              <div className="text-center py-20 space-y-4">
                <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                  <Utensils className="w-10 h-10 text-orange-300" />
                </div>
                <div className="space-y-2">
                  <p className="text-orange-600 font-black text-lg">No Recipes Found</p>
                  <p className="text-orange-400 font-medium max-w-xs mx-auto">
                    We couldn't find any recipes for "{activeFood}" right now. Try searching for something else!
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-12">
                <div className="grid grid-cols-1 gap-6">
                {recipes.map((recipe, idx) => (
                  <RecipeCard 
                    key={idx}
                    recipe={recipe}
                    isLiked={!!likedRecipes.find(r => r.recipe_name === recipe.name)}
                    onToggleLike={toggleLike}
                    translations={t}
                  />
                ))}
              </div>
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
                    <RecipeCard 
                      key={liked.id}
                      recipe={recipe}
                      isLiked={true}
                      onToggleLike={toggleLike}
                      foodItem={liked.food_item}
                      translations={t}
                    />
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
                <LanguageSelector selected={user.language} onSelect={handleLanguageChange} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-orange-500 uppercase">{t.reminderSettings}</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range"
                    min="1"
                    max="30"
                    value={user.reminderDays ?? 7}
                    onChange={async (e) => {
                      const val = parseInt(e.target.value);
                      setUser({...user, reminderDays: val});
                      await fetch(`/api/user/${user.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reminderDays: val })
                      });
                    }}
                    className="flex-1 accent-orange-500"
                  />
                  <span className="w-12 h-12 flex items-center justify-center bg-orange-100 text-orange-600 font-black rounded-xl">
                    {user.reminderDays ?? 7}
                  </span>
                </div>
                <p className="text-[10px] text-orange-400 font-bold uppercase">{t.reminderDaysLabel}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-orange-500 uppercase">{t.notificationFrequency}</label>
                <div className="flex bg-orange-50 p-1 rounded-xl border border-orange-100">
                  {['daily', 'once', 'weekly'].map((freq) => (
                    <button
                      key={freq}
                      onClick={async () => {
                        setUser({...user, notificationFrequency: freq as any});
                        await fetch(`/api/user/${user.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ notificationFrequency: freq })
                        });
                      }}
                      className={cn(
                        "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                        user.notificationFrequency === freq 
                          ? "bg-white text-orange-600 shadow-sm" 
                          : "text-orange-400 hover:text-orange-600"
                      )}
                    >
                      {t[freq] || freq}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <button 
                  onClick={requestNotificationPermission}
                  disabled={notificationsEnabled}
                  className={cn(
                    "w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                    notificationsEnabled 
                      ? "bg-green-50 text-green-600 border border-green-100 cursor-default" 
                      : "bg-orange-50 text-orange-600 border border-orange-100 hover:bg-orange-100"
                  )}
                >
                  <Bell className="w-4 h-4" />
                  {notificationsEnabled ? "Notifications Active" : t.enableNotifications}
                </button>
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
        <Tooltip text={t.progressTitle}>
          <button 
            onClick={() => setView('progress')}
            className={cn("p-2 rounded-xl transition-all", view === 'progress' ? "bg-orange-100 text-orange-600" : "text-orange-300")}
          >
            <BarChart3 className="w-7 h-7" />
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
