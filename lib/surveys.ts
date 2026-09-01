export type Respondent = 'human' | 'persona';

export type CategoryKey =
  | 'planner'
  | 'comfort'
  | 'explorer'
  | 'connector'
  | 'improviser'
  | 'analyst'
  | 'fixer'
  | 'collaborator'
  | 'adapter'
  | 'anchor';

export type AxisWeights = [number, number, number, number];

export interface SurveyOption {
  id: string;
  label: string;
  category?: CategoryKey;
  value?: number;
  weights?: AxisWeights;
}

export interface SurveyQuestion {
  id: string;
  prompt: string;
  options: SurveyOption[];
  dimension?: string;
}

export type SurveyKind = 'categorical' | 'scale' | 'silly';

export interface SurveyDefinition {
  id: SurveyId;
  title: string;
  shortTitle: string;
  description: string;
  time: string;
  kind: SurveyKind;
  color: string;
  pale: string;
  ink: string;
  questions: SurveyQuestion[];
}

export type SurveyId =
  | 'everyday'
  | 'dials'
  | 'plot-twists'
  | 'internet-creature';

const scaleOptions: SurveyOption[] = [
  { id: '1', label: 'Not at all like me', value: 1 },
  { id: '2', label: 'A little like me', value: 2 },
  { id: '3', label: 'Somewhat like me', value: 3 },
  { id: '4', label: 'Very much like me', value: 4 },
  { id: '5', label: 'Exactly like me', value: 5 },
];

const everydayQuestions: SurveyQuestion[] = [
  {
    id: 'free-saturday',
    prompt: 'A completely free Saturday appears. What sounds best?',
    options: [
      {
        id: 'shared-plan',
        label: 'Text someone and turn it into a shared plan',
        category: 'connector',
      },
      {
        id: 'short-plan',
        label: 'Make a short plan for the day',
        category: 'planner',
      },
      {
        id: 'follow-mood',
        label: 'Follow your mood and decide as you go',
        category: 'improviser',
      },
      {
        id: 'try-new',
        label: 'Try a place or activity you have not done before',
        category: 'explorer',
      },
      {
        id: 'familiar-comforts',
        label: 'Stay close to home with familiar comforts',
        category: 'comfort',
      },
    ],
  },
  {
    id: 'restaurant',
    prompt: 'How would you choose a restaurant?',
    options: [
      {
        id: 'known-place',
        label: 'Pick somewhere familiar where you know what you like',
        category: 'comfort',
      },
      {
        id: 'new-cuisine',
        label: 'Choose a cuisine or place you have never tried',
        category: 'explorer',
      },
      {
        id: 'compare-first',
        label: 'Compare menus, prices, and reviews first',
        category: 'planner',
      },
      {
        id: 'group-choice',
        label: 'Go wherever the group will enjoy most',
        category: 'connector',
      },
      {
        id: 'nearest-decent',
        label: 'Choose the nearest decent option when hunger wins',
        category: 'improviser',
      },
    ],
  },
  {
    id: 'packing',
    prompt: 'How would you pack for a weekend away?',
    options: [
      {
        id: 'ask-group',
        label: 'Ask what everyone else is bringing so the group is covered',
        category: 'connector',
      },
      {
        id: 'comfort-extras',
        label: 'Pack comfortable favorites and a few reassuring extras',
        category: 'comfort',
      },
      {
        id: 'last-minute',
        label: 'Throw in the basics shortly before leaving',
        category: 'improviser',
      },
      {
        id: 'checklist',
        label: 'Use a checklist and pack ahead of time',
        category: 'planner',
      },
      {
        id: 'unexpected-detour',
        label: 'Pack for an unexpected detour or adventure',
        category: 'explorer',
      },
    ],
  },
  {
    id: 'buy-item',
    prompt: 'You need to buy an everyday item. What do you do?',
    options: [
      {
        id: 'trusted-judgment',
        label: 'Ask someone whose judgment you trust',
        category: 'connector',
      },
      {
        id: 'first-that-works',
        label: 'Buy the first option that clearly does the job',
        category: 'improviser',
      },
      {
        id: 'specs-reviews',
        label: 'Compare specifications, reviews, and prices',
        category: 'planner',
      },
      {
        id: 'known-brand',
        label: 'Choose a brand or model you already know',
        category: 'comfort',
      },
      {
        id: 'newest-option',
        label: 'Try the newest or most interesting option',
        category: 'explorer',
      },
    ],
  },
  {
    id: 'after-demanding-day',
    prompt: 'What sounds best after a demanding day?',
    options: [
      {
        id: 'change-scenery',
        label: 'Get a change of scenery or do something different',
        category: 'explorer',
      },
      {
        id: 'contact-someone',
        label: 'Call, message, or meet someone',
        category: 'connector',
      },
      {
        id: 'favorite-routine',
        label: 'Have your favorite food, show, or routine',
        category: 'comfort',
      },
      {
        id: 'prepare-tomorrow',
        label: 'Tidy up and prepare for tomorrow',
        category: 'planner',
      },
      {
        id: 'whatever-feels-good',
        label: 'Do whatever sounds good in the moment',
        category: 'improviser',
      },
    ],
  },
];

const dialQuestions: SurveyQuestion[] = [
  {
    id: 'structure',
    dimension: 'Structure',
    prompt: 'I like to know what I am doing before the day begins.',
    options: scaleOptions,
  },
  {
    id: 'social-recharge',
    dimension: 'Social recharge',
    prompt:
      'After a demanding week, spending time with other people usually restores my energy.',
    options: scaleOptions,
  },
  {
    id: 'novelty',
    dimension: 'Novelty',
    prompt:
      'Given a safe choice, I usually prefer a new experience to a dependable favorite.',
    options: scaleOptions,
  },
  {
    id: 'decision-speed',
    dimension: 'Decision speed',
    prompt: 'Once I have enough information, I make decisions quickly.',
    options: scaleOptions,
  },
  {
    id: 'expressiveness',
    dimension: 'Expressiveness',
    prompt: 'People can usually tell how I am feeling without asking.',
    options: scaleOptions,
  },
];

const plotTwistQuestions: SurveyQuestion[] = [
  {
    id: 'cancelled-plans',
    prompt:
      'Your plans are cancelled an hour before they start. What do you do?',
    options: [
      {
        id: 'open-space',
        label: 'Enjoy the open space and see where the day goes',
        category: 'adapter',
      },
      {
        id: 'check-change',
        label: 'Check what changed and compare the available options',
        category: 'analyst',
      },
      {
        id: 'reliable-backup',
        label: 'Switch to a dependable, low-effort backup',
        category: 'anchor',
      },
      {
        id: 'ask-everyone',
        label: 'Ask what everyone now feels like doing',
        category: 'collaborator',
      },
      {
        id: 'replace-plan',
        label: 'Suggest a replacement plan immediately',
        category: 'fixer',
      },
    ],
  },
  {
    id: 'stops-working',
    prompt:
      'Something you need suddenly stops working. What is your first move?',
    options: [
      {
        id: 'workaround',
        label: 'Use a different tool or invent a workaround',
        category: 'adapter',
      },
      {
        id: 'likely-causes',
        label: 'Look up likely causes before touching anything',
        category: 'analyst',
      },
      {
        id: 'repair-first',
        label: 'Repair or restart the obvious parts first',
        category: 'fixer',
      },
      {
        id: 'ask-expert',
        label: 'Ask someone experienced to help',
        category: 'collaborator',
      },
      {
        id: 'make-safe',
        label: 'Make the situation safe and avoid causing more damage',
        category: 'anchor',
      },
    ],
  },
  {
    id: 'vague-help',
    prompt:
      'A friend asks for help but describes the problem vaguely. What do you do?',
    options: [
      {
        id: 'next-step',
        label: 'Offer one concrete next step',
        category: 'fixer',
      },
      {
        id: 'listen-first',
        label: 'Listen first and make sure they feel understood',
        category: 'collaborator',
      },
      {
        id: 'clarify',
        label: 'Ask questions until the real problem is clearer',
        category: 'analyst',
      },
      {
        id: 'urgent-part',
        label: 'Help them slow down and handle the most urgent part',
        category: 'anchor',
      },
      {
        id: 'give-options',
        label: 'Offer a few options and let them steer',
        category: 'adapter',
      },
    ],
  },
  {
    id: 'day-trip',
    prompt: 'Your group cannot choose a day trip. What do you do?',
    options: [
      {
        id: 'quick-vote',
        label: 'Run a quick vote so everyone has a say',
        category: 'collaborator',
      },
      {
        id: 'easy-option',
        label: 'Recommend the easiest reliable option',
        category: 'anchor',
      },
      {
        id: 'adapt-to-winner',
        label: 'Say you can adapt to whichever option wins',
        category: 'adapter',
      },
      {
        id: 'compare-trip',
        label: 'Compare travel time, cost, and what is open',
        category: 'analyst',
      },
      {
        id: 'propose-one',
        label: 'Choose one good option and propose it',
        category: 'fixer',
      },
    ],
  },
  {
    id: 'extra-money',
    prompt:
      'You unexpectedly receive 100 euros. What are you most likely to do?',
    options: [
      { id: 'save-it', label: 'Save it for a future need', category: 'anchor' },
      {
        id: 'share-it',
        label: 'Use some for a shared meal, outing, or gift',
        category: 'collaborator',
      },
      {
        id: 'useful-thing',
        label: 'Put it toward something useful you have meant to get',
        category: 'fixer',
      },
      {
        id: 'compare-options',
        label: 'Compare saving, spending, and investing before deciding',
        category: 'analyst',
      },
      {
        id: 'keep-available',
        label: 'Keep it available until something catches your interest',
        category: 'adapter',
      },
    ],
  },
];

const sillyQuestions: SurveyQuestion[] = [
  {
    id: 'q1',
    prompt: 'Your group chat is blowing up at midnight. You...',
    options: [
      {
        id: 'a',
        label: 'Arrive with takes and a snack tier list',
        weights: [2, 1, 2, 1],
      },
      {
        id: 'b',
        label: 'Read everything and respond with one perfect emoji',
        weights: [-1, 2, -1, -1],
      },
      {
        id: 'c',
        label: 'Mute until morning, then send a thesis',
        weights: [-2, 2, 1, 0],
      },
      {
        id: 'd',
        label: 'Start a poll to restore order',
        weights: [1, 2, 0, 2],
      },
    ],
  },
  {
    id: 'q2',
    prompt:
      'A new app drops and everyone pretends they always knew about it. You...',
    options: [
      {
        id: 'a',
        label: 'Install immediately and become the tutorial person',
        weights: [2, 1, 1, 1],
      },
      {
        id: 'b',
        label: 'Wait a week for the patch notes of society',
        weights: [-2, 2, -1, -1],
      },
      {
        id: 'c',
        label: 'Post a joke review before reading the terms',
        weights: [1, -2, 2, 0],
      },
      {
        id: 'd',
        label: 'Research quietly, then drop a link like a bat signal',
        weights: [-1, 2, 0, 1],
      },
    ],
  },
  {
    id: 'q3',
    prompt: 'Your calendar looks like modern art. Your reaction is...',
    options: [
      {
        id: 'a',
        label: 'Color-code until it becomes a personality',
        weights: [0, 2, 0, 1],
      },
      {
        id: 'b',
        label: 'Ignore it and trust vibes (risky)',
        weights: [0, -2, 1, -1],
      },
      {
        id: 'c',
        label: 'Cancel one thing to feel alive',
        weights: [-1, -1, 2, 1],
      },
      {
        id: 'd',
        label: "Add a 'breathing' block like you're a firmware update",
        weights: [0, 2, -1, -1],
      },
    ],
  },
  {
    id: 'q4',
    prompt: 'Someone is wrong on the internet (again). You...',
    options: [
      {
        id: 'a',
        label: 'Debate with sources and screenshots',
        weights: [2, 1, 2, 2],
      },
      {
        id: 'b',
        label: 'Close the tab and touch grass (metaphorically)',
        weights: [-2, 1, -2, -2],
      },
      {
        id: 'c',
        label: 'Quote tweet with a joke that ends careers',
        weights: [1, -1, 2, 1],
      },
      {
        id: 'd',
        label: 'Send a private message like a diplomat',
        weights: [-1, 2, 0, -2],
      },
    ],
  },
  {
    id: 'q5',
    prompt: 'Your ideal weekend is...',
    options: [
      {
        id: 'a',
        label: 'People, plans, and a little planned chaos',
        weights: [2, 1, 1, 0],
      },
      {
        id: 'b',
        label: 'Solo project + playlist + zero obligations',
        weights: [-2, 1, 0, -1],
      },
      {
        id: 'c',
        label: "Spontaneous trip because someone said 'what if'",
        weights: [1, -2, 2, 1],
      },
      {
        id: 'd',
        label: 'Hosting: you bring the board games and boundaries',
        weights: [2, 2, 0, 1],
      },
    ],
  },
  {
    id: 'q6',
    prompt: 'Notifications are...',
    options: [
      {
        id: 'a',
        label: "Dopamine slot machines (I'm fine)",
        weights: [2, -1, 2, 0],
      },
      {
        id: 'b',
        label: 'A tax I pay to exist online',
        weights: [-1, 2, -1, -1],
      },
      {
        id: 'c',
        label: 'A to-do list written by gremlins',
        weights: [0, -2, 1, 1],
      },
      {
        id: 'd',
        label: 'Managed like a small government',
        weights: [0, 2, -2, 1],
      },
    ],
  },
  {
    id: 'q7',
    prompt: 'When you learn something new, you...',
    options: [
      {
        id: 'a',
        label: 'Tell everyone immediately (education is sharing)',
        weights: [2, 0, 1, 0],
      },
      {
        id: 'b',
        label: 'Take notes and forget where you saved them',
        weights: [-1, -1, 0, -1],
      },
      {
        id: 'c',
        label: "Go deep until it's a personality trait",
        weights: [-1, 1, 2, 1],
      },
      {
        id: 'd',
        label: 'Build a system so you never learn it wrong again',
        weights: [0, 2, 0, 1],
      },
    ],
  },
  {
    id: 'q8',
    prompt: 'Your relationship with deadlines is best described as...',
    options: [
      {
        id: 'a',
        label: "We're coworkers who respect each other",
        weights: [0, 2, 0, 1],
      },
      {
        id: 'b',
        label: "They're suggestions from a parallel universe",
        weights: [0, -2, 2, 0],
      },
      {
        id: 'c',
        label: 'I finish early to flex emotionally',
        weights: [1, 2, 1, 2],
      },
      {
        id: 'd',
        label: 'I need adrenaline to unlock literacy',
        weights: [1, -2, 2, 1],
      },
    ],
  },
  {
    id: 'q9',
    prompt: 'A friend vents for 20 minutes. You...',
    options: [
      {
        id: 'a',
        label: 'Match their energy and escalate supportively',
        weights: [1, 0, 2, 0],
      },
      {
        id: 'b',
        label: 'Listen quietly and ask one sharp question',
        weights: [-1, 1, 0, -1],
      },
      {
        id: 'c',
        label: 'Offer solutions like a startup founder',
        weights: [1, 2, 0, 2],
      },
      {
        id: 'd',
        label: 'Send memes until the vibe stabilizes',
        weights: [1, -1, 2, -1],
      },
    ],
  },
  {
    id: 'q10',
    prompt: 'Your shopping cart is...',
    options: [
      {
        id: 'a',
        label: 'A vision board with shipping fees',
        weights: [1, -1, 2, 0],
      },
      {
        id: 'b',
        label: 'Curated, compared, and slightly haunted',
        weights: [-1, 2, 0, 0],
      },
      {
        id: 'c',
        label: "Empty because I'm 'being good' (lying)",
        weights: [-1, 1, 1, -1],
      },
      {
        id: 'd',
        label: 'One weird item that explains my entire psyche',
        weights: [0, -2, 2, 1],
      },
    ],
  },
  {
    id: 'q11',
    prompt: 'Conflict in a group project appears. You...',
    options: [
      {
        id: 'a',
        label: 'Take the mic and propose a structure',
        weights: [2, 2, 1, 2],
      },
      {
        id: 'b',
        label: 'Slip helpful notes like a ghost editor',
        weights: [-2, 2, -1, -2],
      },
      {
        id: 'c',
        label: 'Make a joke so nobody cries',
        weights: [1, -1, 2, -1],
      },
      {
        id: 'd',
        label: 'Divide tasks like a benevolent warlord',
        weights: [1, 2, 0, 2],
      },
    ],
  },
  {
    id: 'q12',
    prompt: 'Your aesthetic online is...',
    options: [
      {
        id: 'a',
        label: 'Curated chaos with good lighting',
        weights: [2, -1, 2, 0],
      },
      { id: 'b', label: "Minimalist until you're not", weights: [-1, 2, 0, 0] },
      {
        id: 'c',
        label: 'Lore-heavy and slightly threatening',
        weights: [-1, 1, 2, 1],
      },
      {
        id: 'd',
        label: 'Friendly and approachable (weaponized)',
        weights: [2, 1, 0, -1],
      },
    ],
  },
  {
    id: 'q13',
    prompt: 'When plans change last minute, you feel...',
    options: [
      {
        id: 'a',
        label: 'Thrilled - new timeline unlocked',
        weights: [1, -2, 2, 0],
      },
      {
        id: 'b',
        label: 'Annoyed but adaptable (silently)',
        weights: [-1, 1, 0, -1],
      },
      {
        id: 'c',
        label: "Ready to negotiate like it's a sport",
        weights: [1, 2, 1, 2],
      },
      {
        id: 'd',
        label: 'Relieved - I wanted an excuse to stay in',
        weights: [-2, 1, -1, -2],
      },
    ],
  },
  {
    id: 'q14',
    prompt: 'You get a compliment in public. You...',
    options: [
      { id: 'a', label: 'Radiate like a lighthouse', weights: [2, 0, 2, 0] },
      { id: 'b', label: 'Nod and evaporate', weights: [-2, 1, -2, -2] },
      {
        id: 'c',
        label: 'Deflect with humor (too fast)',
        weights: [1, -1, 1, -1],
      },
      {
        id: 'd',
        label: 'Say thank you like you practiced in a mirror',
        weights: [0, 2, 0, 1],
      },
    ],
  },
  {
    id: 'q15',
    prompt: 'Your notes app contains...',
    options: [
      {
        id: 'a',
        label: 'Lists inside lists (inception)',
        weights: [0, 2, 0, 1],
      },
      { id: 'b', label: 'Poetry and passwords (bad)', weights: [-1, -2, 2, 0] },
      {
        id: 'c',
        label: "Half-baked ideas labeled 'later'",
        weights: [0, -1, 1, -1],
      },
      {
        id: 'd',
        label: 'Nothing - I live in the moment (lie)',
        weights: [1, -2, 2, 1],
      },
    ],
  },
  {
    id: 'q16',
    prompt: 'A trend is annoying but everywhere. You...',
    options: [
      {
        id: 'a',
        label: "Participate ironically until it's sincere",
        weights: [2, -1, 2, 0],
      },
      {
        id: 'b',
        label: 'Observe from a distance like a scientist',
        weights: [-2, 2, -1, 0],
      },
      { id: 'c', label: 'Complain creatively', weights: [1, 0, 2, 1] },
      {
        id: 'd',
        label: 'Ignore it until it dies naturally',
        weights: [-1, 1, -2, -2],
      },
    ],
  },
  {
    id: 'q17',
    prompt: 'Your dream collaboration is with...',
    options: [
      {
        id: 'a',
        label: 'A crowd - more minds, more memes',
        weights: [2, 0, 1, 0],
      },
      {
        id: 'b',
        label: 'One person who gets your weird',
        weights: [-2, 1, 1, 0],
      },
      {
        id: 'c',
        label: 'Future you (time travel budget pending)',
        weights: [-1, 1, 2, 1],
      },
      {
        id: 'd',
        label: 'A rival - healthy competition',
        weights: [1, 1, 1, 2],
      },
    ],
  },
  {
    id: 'q18',
    prompt: "When you're stressed, you...",
    options: [
      {
        id: 'a',
        label: "Talk it out until it's a podcast",
        weights: [2, 0, 2, 0],
      },
      {
        id: 'b',
        label: 'Go quiet and fix things in silence',
        weights: [-2, 2, 0, -1],
      },
      {
        id: 'c',
        label: "Make jokes to avoid feelings (works until it doesn't)",
        weights: [1, -1, 2, -1],
      },
      {
        id: 'd',
        label: 'Make a plan so aggressive it calms you down',
        weights: [0, 2, 1, 2],
      },
    ],
  },
  {
    id: 'q19',
    prompt: "Your relationship with 'reply all' is...",
    options: [
      { id: 'a', label: 'Weaponized joy', weights: [2, -1, 2, 1] },
      { id: 'b', label: 'A crime scene I avoid', weights: [-2, 2, -2, -2] },
      { id: 'c', label: 'Situational comedy', weights: [1, -2, 2, 0] },
      { id: 'd', label: "Only if I'm saving everyone", weights: [1, 2, 0, 2] },
    ],
  },
  {
    id: 'q20',
    prompt: 'You discover a new hyperfixation. It lasts...',
    options: [
      {
        id: 'a',
        label: 'Until the next shiny object (beautiful)',
        weights: [1, -2, 2, 0],
      },
      {
        id: 'b',
        label: 'Long enough to become an expert',
        weights: [-1, 2, 1, 1],
      },
      {
        id: 'c',
        label: 'Forever, quietly, in the background',
        weights: [-2, 1, 0, 0],
      },
      {
        id: 'd',
        label: 'Until I monetize it accidentally',
        weights: [1, 1, 2, 2],
      },
    ],
  },
  {
    id: 'q21',
    prompt: 'Your ideal internet is...',
    options: [
      { id: 'a', label: 'A party with good moderation', weights: [2, 1, 1, 0] },
      {
        id: 'b',
        label: 'A library with jokes in the margins',
        weights: [-2, 2, 0, -1],
      },
      {
        id: 'c',
        label: 'An art project that occasionally bites',
        weights: [0, -1, 2, 1],
      },
      {
        id: 'd',
        label: 'A calm feed and a chaotic alt',
        weights: [1, 1, 1, 0],
      },
    ],
  },
  {
    id: 'q22',
    prompt: 'When you disagree with a friend, you...',
    options: [
      {
        id: 'a',
        label: 'Say it plainly - love is honest',
        weights: [1, 1, 1, 2],
      },
      {
        id: 'b',
        label: "Soften it until it's a suggestion",
        weights: [-1, 1, 0, -2],
      },
      { id: 'c', label: 'Debate for sport, hug after', weights: [2, -1, 2, 1] },
      {
        id: 'd',
        label: 'Write a draft and delete it (classic)',
        weights: [-2, 2, 1, -1],
      },
    ],
  },
  {
    id: 'q23',
    prompt: 'Your vibe at a party is...',
    options: [
      { id: 'a', label: 'Center of gravity', weights: [2, 0, 2, 1] },
      {
        id: 'b',
        label: 'Wallpaper that occasionally speaks',
        weights: [-2, 1, -1, -2],
      },
      { id: 'c', label: 'Kitchen hangout philosopher', weights: [0, 0, 1, 0] },
      {
        id: 'd',
        label: 'Early exit, legendary exit line',
        weights: [-1, 2, 0, 0],
      },
    ],
  },
  {
    id: 'q24',
    prompt: 'You finish a big project. You celebrate by...',
    options: [
      {
        id: 'a',
        label: 'Telling people (they need to know)',
        weights: [2, 0, 2, 1],
      },
      { id: 'b', label: 'Disappearing into peace', weights: [-2, 1, -1, -2] },
      {
        id: 'c',
        label: 'Immediately starting the next thing (help)',
        weights: [1, 1, 2, 2],
      },
      {
        id: 'd',
        label: 'One nice meal and zero screens',
        weights: [-1, 2, 0, -1],
      },
    ],
  },
  {
    id: 'q25',
    prompt: 'Your toxic trait (affectionate) is...',
    options: [
      { id: 'a', label: 'Too online to log off', weights: [2, -1, 2, 0] },
      { id: 'b', label: 'Too offline to explain', weights: [-2, 1, -1, -1] },
      { id: 'c', label: 'Too intense for small talk', weights: [0, 0, 2, 1] },
      {
        id: 'd',
        label: 'Too organized to be spontaneous',
        weights: [0, 2, 0, 1],
      },
    ],
  },
  {
    id: 'q26',
    prompt: 'If your brain had a UI, it would be...',
    options: [
      { id: 'a', label: 'Neon and loud sliders', weights: [2, -2, 2, 1] },
      { id: 'b', label: 'Clean monospace and secrets', weights: [-2, 2, 0, 0] },
      { id: 'c', label: 'A wiki that edits itself', weights: [-1, 1, 2, 0] },
      {
        id: 'd',
        label: "A single button labeled 'do not'",
        weights: [0, 2, 1, -1],
      },
    ],
  },
  {
    id: 'q27',
    prompt: 'You want feedback on something personal. You ask...',
    options: [
      { id: 'a', label: 'The group chat (democracy)', weights: [2, 0, 1, 0] },
      {
        id: 'b',
        label: 'One trusted human (precision)',
        weights: [-2, 1, 0, -1],
      },
      {
        id: 'c',
        label: 'The internet anonymously (bold)',
        weights: [1, -1, 2, 1],
      },
      {
        id: 'd',
        label: 'Nobody - I iterate in silence',
        weights: [-1, 2, 0, 0],
      },
    ],
  },
  {
    id: 'q28',
    prompt: 'Finally: this whole silly type quiz is basically...',
    options: [
      { id: 'a', label: 'A mirror with jokes', weights: [1, 1, 1, -1] },
      {
        id: 'b',
        label: 'A toy for thinking, not a diagnosis',
        weights: [-1, 2, 0, -2],
      },
      {
        id: 'c',
        label: 'A way to tag my chaos for science (not science)',
        weights: [1, -1, 2, 1],
      },
      {
        id: 'd',
        label: "Fun - unless I'm losing, then it's rigged",
        weights: [2, -2, 2, 2],
      },
    ],
  },
];

export const surveys: SurveyDefinition[] = [
  {
    id: 'everyday',
    title: 'Everyday Defaults',
    shortTitle: 'Everyday Defaults',
    description:
      'See whether your persona knows the small preferences that quietly shape your day.',
    time: '1 minute per run',
    kind: 'categorical',
    color: '#ff6b35',
    pale: '#fff1ea',
    ink: '#6d270d',
    questions: everydayQuestions,
  },
  {
    id: 'dials',
    title: 'Personal Dials',
    shortTitle: 'Personal Dials',
    description:
      'Compare degree, not just direction, across five everyday personality dimensions.',
    time: '1 minute per run',
    kind: 'scale',
    color: '#6457d7',
    pale: '#efedff',
    ink: '#302779',
    questions: dialQuestions,
  },
  {
    id: 'plot-twists',
    title: 'Small Plot Twists',
    shortTitle: 'Small Plot Twists',
    description:
      'Test how well your persona predicts what you do when ordinary plans go sideways.',
    time: '1 minute per run',
    kind: 'categorical',
    color: '#0f9f7b',
    pale: '#e4f8f2',
    ink: '#075f4b',
    questions: plotTwistQuestions,
  },
  {
    id: 'internet-creature',
    title: 'Internet Creature',
    shortTitle: 'Internet Creature',
    description:
      'A full silly type quiz for finding out whether your persona shares your exact flavor of online chaos.',
    time: '6 minutes per run',
    kind: 'silly',
    color: '#e33186',
    pale: '#ffe8f3',
    ink: '#7d1746',
    questions: sillyQuestions,
  },
];

export const surveyById = Object.fromEntries(
  surveys.map((survey) => [survey.id, survey]),
) as Record<SurveyId, SurveyDefinition>;

export const categoryMeta: Record<
  CategoryKey,
  { name: string; description: string }
> = {
  planner: {
    name: 'The Thoughtful Planner',
    description: 'You feel best when the next step is visible.',
  },
  comfort: {
    name: 'The Comfort Curator',
    description: 'You know which familiar things reliably make life better.',
  },
  explorer: {
    name: 'The Curious Explorer',
    description: 'Novelty is usually worth the detour.',
  },
  connector: {
    name: 'The Social Connector',
    description: 'Other people are part of how you choose and recharge.',
  },
  improviser: {
    name: 'The Easygoing Improviser',
    description: 'You prefer enough structure to move, then adapt.',
  },
  analyst: {
    name: 'The Curious Analyst',
    description: 'You orient yourself by understanding what is happening.',
  },
  fixer: {
    name: 'The Practical Fixer',
    description: 'For you, action is often the fastest route to clarity.',
  },
  collaborator: {
    name: 'The Friendly Collaborator',
    description: 'You naturally solve problems with other people.',
  },
  adapter: {
    name: 'The Flexible Adapter',
    description: 'You stay light on your feet when circumstances change.',
  },
  anchor: {
    name: 'The Steady Anchor',
    description: 'You reduce risk and make the next step feel manageable.',
  },
};

export const sillyTypeMeta: Record<
  string,
  { name: string; description: string }
> = {
  EOVA: {
    name: 'Main Character Meteor',
    description:
      'Visible, organized, loud, and ready to debate the group chat into orbit.',
  },
  EOVP: {
    name: 'Friendly Raid Boss',
    description:
      'A high-energy organizer who would still like everyone to have a nice time.',
  },
  EOMA: {
    name: 'Drama Documentarian',
    description:
      'You arrive with receipts, a narrative arc, and excellent timing.',
  },
  EOMP: {
    name: 'Hype Librarian',
    description: 'You bring the crowd together, then quietly catalog the lore.',
  },
  ELVA: {
    name: 'Chaos Goblin CEO',
    description:
      'Bold ideas, maximum volume, and a plan that appeared three seconds ago.',
  },
  ELVP: {
    name: 'Meme Syndicate Intern',
    description:
      'Socially fearless, delightfully scattered, and committed to keeping the vibe alive.',
  },
  ELMA: {
    name: 'Speedrun Poster',
    description:
      'Fast, improvisational, and somehow already replying before the thought finishes.',
  },
  ELMP: {
    name: 'Tab Hoarder Supreme',
    description:
      'A friendly browser tornado with seventeen interests and no desire for conflict.',
  },
  IOVA: {
    name: 'Soft Launch Strategist',
    description:
      'Quietly prepared, carefully visible, and more decisive than people expect.',
  },
  IOVP: {
    name: 'Quiet Brand Evangelist',
    description:
      'Measured, organized enthusiasm delivered to exactly the right audience.',
  },
  IOMA: {
    name: 'Cryptic Hint Machine',
    description:
      'Your restrained posts suggest there is a much larger document somewhere.',
  },
  IOMP: {
    name: 'Offline Sage',
    description:
      'Calm, deliberate, and likely to return with the one answer everyone needed.',
  },
  ILVA: {
    name: 'Precision Troll',
    description:
      'Low-profile chaos deployed with accuracy and absolutely no wasted motion.',
  },
  ILVP: {
    name: 'Lurker With Opinions',
    description:
      'You watch the whole timeline and save your best take for the safest room.',
  },
  ILMA: {
    name: 'Minimalist Menace',
    description:
      'Sparse words, surprising force, and a workflow only you understand.',
  },
  ILMP: {
    name: 'Void Enjoyer',
    description:
      'Peacefully unbothered, privately curious, and comfortable beyond the reach of notifications.',
  },
};

export const axisMeta = [
  {
    key: 'e',
    low: 'Inbox Hermit',
    high: 'Extro-feed',
    lowLetter: 'I',
    highLetter: 'E',
  },
  {
    key: 'o',
    low: 'Loopcore',
    high: 'Outline Brain',
    lowLetter: 'L',
    highLetter: 'O',
  },
  {
    key: 'v',
    low: 'Muted Lore',
    high: 'Volume Poster',
    lowLetter: 'M',
    highLetter: 'V',
  },
  {
    key: 'a',
    low: 'Peace Treaty',
    high: 'Attack-forward',
    lowLetter: 'P',
    highLetter: 'A',
  },
] as const;

export const dialLabels: Record<string, string[]> = {
  structure: [
    'Flow-led',
    'Lightly planned',
    'Flexible middle',
    'Structured',
    'Plan-first',
  ],
  'social-recharge': [
    'Solo recharger',
    'Mostly solo',
    'Depends on the day',
    'People-powered',
    'Highly social recharge',
  ],
  novelty: [
    'Favorite keeper',
    'Familiarity-leaning',
    'Selective explorer',
    'Novelty-seeking',
    'Adventure-first',
  ],
  'decision-speed': [
    'Deliberate',
    'Careful',
    'Context-dependent',
    'Quick',
    'Fast-moving',
  ],
  expressiveness: [
    'Private processor',
    'Low-key',
    'Selectively open',
    'Expressive',
    'Open book',
  ],
};
