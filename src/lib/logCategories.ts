export interface CategoryConfig {
  key: string;
  title: string;
  titleLabel: string;
  subtitleLabel: string;
  gradient1: readonly [string, string, ...string[]];
  gradient2: readonly [string, string, ...string[]];
  accent: string;
  tags?: string[];
}

export const CATEGORIES = {
  '🎤 gig': {
    key: '🎤 gig',
    title: '🎤 Gigs',
    titleLabel: 'Artist',
    subtitleLabel: 'Venue',
    gradient1: ['#FF9CEE', '#B39DFF', '#9DD9FF', '#FF9CEE'],
    gradient2: ['#FFE566', 'transparent', '#FF6BBA'],
    accent: '#9333EA',
    tags: ['Headliner', 'Support', 'Festival', 'Music'],
  },
  '📖 book': {
    key: '📖 book',
    title: '📖 Books',
    titleLabel: 'Title',
    subtitleLabel: 'Author',
    gradient1: ['#FDBA74', '#F9A8D4', '#C4B5FD', '#FDE68A'],
    gradient2: ['#FB7185', 'transparent', '#A78BFA'],
    accent: '#DB2777',
    tags: ['Fiction', 'Non-fiction', 'Sci-Fi', 'Graphic Novel', 'Modern Classic', 'Audiobook', 'Music'],
  },
  '🍵 tea': {
    key: '🍵 tea',
    title: '🍵 Tea',
    titleLabel: 'Tea',
    subtitleLabel: 'Shop',
    gradient1: ['#6EE7B7', '#BAE6FD', '#DDD6FE', '#A7F3D0'],
    gradient2: ['#FDE68A', 'transparent', '#86EFAC'],
    accent: '#059669',
  },
  '🌶️ chilli': {
    key: '🌶️ chilli',
    title: '🌶️ Chilli Sauces',
    titleLabel: 'Sauce',
    subtitleLabel: 'Brand',
    gradient1: ['#FCA5A5', '#FCD34D', '#FF8C42', '#FCA5A5'],
    gradient2: ['#FF4500', 'transparent', '#FFA500'],
    accent: '#DC2626',
  },
  '🌍 countries': {
    key: '🌍 countries',
    title: '🌍 Countries',
    titleLabel: 'Country',
    subtitleLabel: 'Continent',
    gradient1: ['#93C5FD', '#6EE7B7', '#FDE68A', '#93C5FD'],
    gradient2: ['#A5B4FC', 'transparent', '#FCA5A5'],
    accent: '#0284C7',
  },
  '🐸 wildlife': {
    key: '🐸 wildlife',
    title: '🐸 Wildlife',
    titleLabel: 'Animal',
    subtitleLabel: 'Location',
    gradient1: ['#FDE68A', '#86EFAC', '#6EE7B7', '#D9F99D'],
    gradient2: ['#F97316', 'transparent', '#84CC16'],
    accent: '#16A34A',
    tags: ['Bird', 'Land', 'Marine', 'Bird of Prey', 'Eagle', 'Mammal', 'Monkey', 'Fish', 'Shark', 'Whale', 'Reptile', 'Amphibian', 'Rodent', 'Spider', 'Tropical', 'Woodpecker', 'Owl', 'Ray'],
  },
} satisfies Record<string, CategoryConfig>;

// Fallback palettes cycled for unknown categories
const FALLBACK_PALETTES: Array<{
  gradient1: readonly [string, string, ...string[]];
  gradient2: readonly [string, string, ...string[]];
  accent: string;
}> = [
  {
    gradient1: ['#F9A8D4', '#C084FC', '#93C5FD', '#F9A8D4'],
    gradient2: ['#FCD34D', 'transparent', '#86EFAC'],
    accent: '#9333EA',
  },
  {
    gradient1: ['#6EE7B7', '#BAE6FD', '#DDD6FE', '#6EE7B7'],
    gradient2: ['#FDE68A', 'transparent', '#6EE7B7'],
    accent: '#0284C7',
  },
  {
    gradient1: ['#FCA5A5', '#FCD34D', '#86EFAC', '#FCA5A5'],
    gradient2: ['#FB923C', 'transparent', '#4ADE80'],
    accent: '#DC2626',
  },
  {
    gradient1: ['#E9D5FF', '#FDE68A', '#BFDBFE', '#E9D5FF'],
    gradient2: ['#F9A8D4', 'transparent', '#A7F3D0'],
    accent: '#7C3AED',
  },
  {
    gradient1: ['#FED7AA', '#FDE68A', '#D9F99D', '#FED7AA'],
    gradient2: ['#FCA5A5', 'transparent', '#6EE7B7'],
    accent: '#D97706',
  },
  {
    gradient1: ['#BFDBFE', '#E9D5FF', '#FBCFE8', '#BFDBFE'],
    gradient2: ['#A7F3D0', 'transparent', '#FCD34D'],
    accent: '#3B82F6',
  },
];

function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function toTitle(key: string): string {
  return key
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function makeConfig(key: string): CategoryConfig {
  if (key in CATEGORIES) return CATEGORIES[key as keyof typeof CATEGORIES];
  const palette = FALLBACK_PALETTES[simpleHash(key) % FALLBACK_PALETTES.length];
  return {
    key,
    title: toTitle(key),
    titleLabel: 'Title',
    subtitleLabel: 'Details',
    ...palette,
  };
}
