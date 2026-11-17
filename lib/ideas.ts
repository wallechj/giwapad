/**
 * One-prompt token ideas — 100% local, no API key.
 *
 * The user describes the token in one sentence (Chinese or English).
 * We detect a theme from keywords, optionally pick up an explicit
 * $SYMBOL or a "叫 XXX" name hint, then compose name / symbol /
 * description from curated pools. "换一批" just re-rolls with a new salt.
 */

export type TokenIdea = {
  name: string;
  symbol: string;
  description: string;
  theme: string;
};

type Theme = {
  id: string;
  label: string;
  keywords: string[];
  subjects: string[];
  taglines: string[];
};

const THEMES: Theme[] = [
  {
    id: "cat", label: "猫",
    keywords: ["cat", "kitten", "kitty", "meow", "猫", "喵", "猫咪"],
    subjects: ["Cat", "Kitten", "Meow", "Neko", "Paws"],
    taglines: ["The cat that runs the curve.", "Nine lives, one bonding curve.", "Purr first, pump later."],
  },
  {
    id: "dog", label: "狗",
    keywords: ["dog", "doge", "puppy", "shiba", "狗", "柴犬", "汪"],
    subjects: ["Doge", "Pup", "Shiba", "Wag", "Bark"],
    taglines: ["Good boy, great chart.", "Every dog has its day — on a bonding curve.", "Wag more, worry less."],
  },
  {
    id: "frog", label: "青蛙",
    keywords: ["frog", "pepe", "青蛙", "蛙"],
    subjects: ["Frog", "Pepe", "Toad", "Hop"],
    taglines: ["Hop on the curve.", "Feels good, man.", "From pond to pool."],
  },
  {
    id: "ai", label: "AI",
    keywords: ["ai", "agent", "bot", "robot", "gpt", "llm", "智能", "机器人", "代理", "人工智能"],
    subjects: ["Agent", "Bot", "Synth", "Neuron", "GPT"],
    taglines: ["Launched by an agent, owned by the crowd.", "Intelligence, tokenized.", "The agent economy starts here."],
  },
  {
    id: "game", label: "游戏",
    keywords: ["game", "gaming", "play", "rpg", "nft game", "游戏", "玩家", "打怪", "电竞"],
    subjects: ["Quest", "Pixel", "Arena", "Loot", "GG"],
    taglines: ["Play it, then trade it.", "GG — good game, great gains.", "Every quest mints a winner."],
  },
  {
    id: "food", label: "美食",
    keywords: ["food", "pizza", "ramen", "coffee", "taco", "美食", "拉面", "披萨", "咖啡", "奶茶", "火锅"],
    subjects: ["Ramen", "Pizza", "Boba", "Taco", "Mochi"],
    taglines: ["Deliciously volatile.", "Tastes like gains.", "Fuel for degens."],
  },
  {
    id: "space", label: "太空",
    keywords: ["space", "moon", "mars", "rocket", "star", "太空", "月球", "火星", "火箭", "星星"],
    subjects: ["Moon", "Mars", "Nova", "Orbit", "Comet"],
    taglines: ["To the moon — literally, on a curve.", "One small step for memes.", "Orbit achieved."],
  },
  {
    id: "music", label: "音乐",
    keywords: ["music", "song", "dj", "beat", "音乐", "歌曲", "摇滚", "说唱", "rap"],
    subjects: ["Beat", "Tempo", "Vinyl", "Bass", "Melody"],
    taglines: ["Turn the volume up on this curve.", "Every holder is a fan.", "Drop the beat, not the price."],
  },
  {
    id: "sport", label: "运动",
    keywords: ["sport", "football", "soccer", "basketball", "nba", "运动", "足球", "篮球", "跑步", "健身"],
    subjects: ["Goal", "Slam", "Sprint", "Champ", "Victory"],
    taglines: ["Champions are minted, not born.", "Score on the curve.", "No pain, no gains."],
  },
  {
    id: "meme", label: "梗",
    keywords: ["meme", "funny", "joke", "梗", "搞笑", "段子", "抽象"],
    subjects: ["Meme", "Lol", "Wojak", "Chad", "Vibe"],
    taglines: ["The joke is the utility.", "Certified fresh meme.", "Vibes only."],
  },
];

const GENERIC: Theme = {
  id: "generic", label: "通用",
  keywords: [],
  subjects: ["Nova", "Apex", "Zenith", "Flux", "Echo", "Orbit"],
  taglines: ["Community first, curve second.", "A fresh launch on GiwaPad.", "Small cap, big dreams."],
};

const PREFIXES = ["Turbo", "Super", "Mega", "Baby", "Golden", "Cosmic", "Lucky", "Hyper", "Crypto", "Magic"];
const SUFFIXES = ["", "Coin", "Fi", "Pad", "X"];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)] as T;
}

function symbolFromName(name: string, rand: () => number): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  let base = "";
  if (words.length >= 2) base = words.map((w) => w[0]).join("") + (words[words.length - 1]?.slice(1, 3) ?? "");
  else base = (words[0] ?? "GPD").slice(0, 4);
  base = base.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (base.length < 3) base = (base + pick(rand, ["X", "INU", "FI", "PAD"])).slice(0, 5);
  return base.slice(0, 5);
}

function detectTheme(prompt: string): Theme {
  const lower = prompt.toLowerCase();
  for (const t of THEMES) {
    if (t.keywords.some((k) => lower.includes(k.toLowerCase()))) return t;
  }
  return GENERIC;
}

function extractSymbol(prompt: string): string | null {
  const m = prompt.match(/\$([A-Za-z]{2,10})\b/);
  return m ? m[1]!.toUpperCase() : null;
}

function extractNameHint(prompt: string): string | null {
  const m = prompt.match(/(?:叫|名字|取名|name(?: is|d)?)\s*[""']?([A-Za-z0-9\u4e00-\u9fa5]{2,12})[""']?/i);
  return m ? m[1]! : null;
}

/** Generate 3 token ideas from one sentence. Pure local logic. */
export function generateTokenIdeas(prompt: string, salt = 0): TokenIdea[] {
  const text = prompt.trim();
  if (!text) return [];
  const theme = detectTheme(text);
  const forcedSymbol = extractSymbol(text);
  const nameHint = extractNameHint(text);
  const rand = mulberry32(hashString(text.toLowerCase()) + salt * 7919);

  const ideas: TokenIdea[] = [];
  const used = new Set<string>();
  for (let i = 0; i < 3; i++) {
    let name: string;
    if (i === 0 && nameHint) {
      name = /^[A-Za-z]/.test(nameHint) ? nameHint : `${pick(rand, PREFIXES)}${nameHint}`;
    } else {
      const subject = pick(rand, theme.subjects);
      const style = rand();
      if (style < 0.4) name = `${pick(rand, PREFIXES)}${subject}`;
      else if (style < 0.7) name = `${subject}${pick(rand, SUFFIXES)}`;
      else name = `${subject} ${pick(rand, ["Club", "Army", "Gang", "Squad", "DAO"])}`;
    }
    if (used.has(name)) name = `${pick(rand, PREFIXES)}${name.replace(/\s/g, "")}`;
    used.add(name);
    const symbol = forcedSymbol && i === 0 ? forcedSymbol : symbolFromName(name, rand);
    const tagline = pick(rand, theme.taglines);
    ideas.push({
      name,
      symbol,
      description: `${tagline} Born from the idea: "${text.length > 80 ? text.slice(0, 80) + "…" : text}" — launched on GiwaPad with the Ammora SDK.`,
      theme: theme.label,
    });
  }
  return ideas;
}

export const PROMPT_EXAMPLES = [
  "一只会写代码的猫",
  "A frog that trades crypto",
  "给熬夜打游戏的人做的能量币 $NIGHT",
  "AI agent 发的第一个币",
];
