export type Grade = 'pre-nursery' | 'nursery1' | 'nursery2' | 'kindergarten1' | 'kindergarten2';

export const GRADE_LABELS: Record<Grade, string> = {
  'pre-nursery': 'Pre-Nursery',
  'nursery1': 'Nursery 1',
  'nursery2': 'Nursery 2',
  'kindergarten1': 'Kindergarten 1',
  'kindergarten2': 'Kindergarten 2',
};

export type CategoryId = 'social' | 'communicator' | 'thinking' | 'physical' | 'arts' | 'change';

export const ETON_CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'social',       label: 'The Social Child' },
  { id: 'communicator', label: 'The Child as a Communicator' },
  { id: 'thinking',     label: 'The Thinking Child' },
  { id: 'physical',     label: 'The Physical Child' },
  { id: 'arts',         label: 'Creative Expression and Enjoyment through the Arts' },
  { id: 'change',       label: 'The Child as an Agent of Change' },
];

export interface LearningSubGoalDef {
  id: string;
  code: string;
  label: string;
}

export interface LearningGoalDef {
  id: string;
  code: string;
  label: string;
  categoryId: CategoryId;
  grade: Grade;
  subGoals: LearningSubGoalDef[];
}

function codeToCategory(code: string): CategoryId {
  const prefix = code.split('.')[0];
  const map: Record<string, CategoryId> = {
    '1': 'social', '2': 'communicator', '3': 'thinking',
    '4': 'physical', '5': 'arts', '6': 'change',
  };
  return map[prefix] ?? 'social';
}

function sg(goalId: string, entries: [string, string][]): LearningSubGoalDef[] {
  const prefix = goalId.split('-')[0]; // 'pn', 'n1', 'n2', 'k1', 'k2'
  return entries.map(([code, label]) => ({ id: `${prefix}-${code}`, code, label }));
}

// ─── Pre-Nursery ──────────────────────────────────────────────────────────────
const PRE_NURSERY_GOALS: LearningGoalDef[] = [
  {
    id: 'pn-1.1', code: '1.1', label: 'Form Relationships with Peers and Adults',
    categoryId: codeToCategory('1.1'), grade: 'pre-nursery',
    subGoals: sg('pn-1.1', [
      ['1.1.1', 'Recognise the school as a safe place'],
      ['1.1.2', 'Increase in confidence whilst playing by themselves and with others with a teacher nearby'],
      ['1.1.3', 'Follow and imitate others in their play'],
      ['1.1.4', 'Observe peers play'],
      ['1.1.5', 'Engage in solitary play'],
      ['1.1.6', 'Playing alongside others'],
      ['1.1.7', 'Increased interest in playing with others'],
      ['1.1.8', 'Develop friendships with others'],
      ['1.1.9', 'Collaborate with peers'],
      ['1.1.10', 'Propose actions/activities'],
      ['1.1.11', 'Begin to care for others by recognising the emotions/feelings of others'],
      ['1.1.12', 'Begin to care for others by showing empathy'],
      ['1.1.13', 'Understand that they have similarities and differences with others'],
      ['1.1.14', 'Demonstrate increasing confidence in new social contexts'],
    ]),
  },
  {
    id: 'pn-1.2', code: '1.2', label: 'Manage Their Own Emotions When Working Both Independently and Interdependently',
    categoryId: codeToCategory('1.2'), grade: 'pre-nursery',
    subGoals: sg('pn-1.2', [
      ['1.2.1', 'Exercise control'],
      ['1.2.2', 'Use appropriate ways to manage and express their emotions'],
      ['1.2.3', 'Seek comfort from adults/peers when needed'],
      ['1.2.4', 'Develop appropriate ways to be assertive'],
      ['1.2.5', 'Communicate about emotions using descriptive words'],
    ]),
  },
  {
    id: 'pn-1.3', code: '1.3', label: 'Build Sense of Self',
    categoryId: codeToCategory('1.3'), grade: 'pre-nursery',
    subGoals: sg('pn-1.3', [
      ['1.3.1', 'Knows their own name, preferences and interests'],
      ['1.3.3', 'Demonstrate the ability to engage with others in long term endeavours'],
      ['1.3.4', 'Display the ability to both initiate tasks and to maintain their engagement in a self chosen task'],
      ['1.3.5', 'Develop an understanding of responsibility'],
      ['1.3.6', 'Begin to develop a sense of responsibility'],
      ['1.3.7', 'Begin to develop a desire for independence'],
      ['1.3.8', 'Show increasing independence'],
      ['1.3.9', 'Begin to use personal pronouns in their conversations'],
      ['1.3.10', 'Celebrate their own strengths and abilities'],
      ['1.3.11', 'Adjust to unfamiliar routines and situations'],
      ['1.3.12', 'Recognise their own needs'],
    ]),
  },
  {
    id: 'pn-1.4', code: '1.4', label: 'Recognise That They Have Choices',
    categoryId: codeToCategory('1.4'), grade: 'pre-nursery',
    subGoals: sg('pn-1.4', [
      ['1.4.1', 'Ask for help when they need it'],
      ['1.4.2', 'Follow rules'],
      ['1.4.3', 'Express their preferences, decisions and autonomy'],
    ]),
  },
  {
    id: 'pn-2.1', code: '2.1', label: 'Early Language - Listen with Increasing Attention and Comprehension',
    categoryId: codeToCategory('2.1'), grade: 'pre-nursery',
    subGoals: sg('pn-2.1', [
      ['2.1.1', 'Able to follow routines and activities'],
      ['2.1.2', 'Listen with interest to the noises adults make when they read stories/sing songs/recite rhymes'],
      ['2.1.3', 'Demonstrate increasing attention span'],
      ['2.1.4', 'Understand single words'],
      ['2.1.5', 'Focus and respond to prompts'],
      ['2.1.6', 'Understand frequently used simple phrases'],
      ['2.1.7', 'Identify familiar objects in the environment when they are described'],
      ['2.1.8', 'Listen with understanding to others'],
      ['2.1.9', 'Understand simple questions'],
      ['2.1.10', "Understand 'why' and 'how' questions"],
    ]),
  },
  {
    id: 'pn-2.2', code: '2.2', label: 'Early Language - Speak with Increasing Clarity and Accuracy',
    categoryId: codeToCategory('2.2'), grade: 'pre-nursery',
    subGoals: sg('pn-2.2', [
      ['2.2.1', 'Use non verbal language to communicate a message'],
      ['2.2.2', 'Copy short expressions and/or new words'],
      ['2.2.3', 'Make themselves understood by using both words and actions'],
      ['2.2.4', 'Begin to put two words together'],
      ['2.2.5', 'Pronounce multi-syllabic words'],
      ['2.2.6', 'String words together into simple sentences'],
      ['2.2.7', 'Start to engage in conversations'],
      ['2.2.8', 'Extend vocabulary to communicate more accurately'],
      ['2.2.9', 'Engage in longer conversations with adults and peers'],
      ['2.2.10', 'Begin to ask a range of simple questions'],
      ['2.2.11', 'Begin to use tenses and plurals'],
      ['2.2.12', 'Express a point of view verbally'],
      ['2.2.13', 'Use talk to organise themselves and their play'],
    ]),
  },
  {
    id: 'pn-2.3', code: '2.3', label: 'Emergent Literacy - Develop Print Awareness and a Love of Reading',
    categoryId: codeToCategory('2.3'), grade: 'pre-nursery',
    subGoals: sg('pn-2.3', [
      ['2.3.1', 'Join in stories, songs and rhymes'],
      ['2.3.2', 'Willingly participate in one-to-one or small group reading experiences'],
      ['2.3.3', 'Repeat words and phrases from familiar stories'],
      ['2.3.4', 'Notice some print and make connections'],
      ['2.3.5', 'Engage in reading behaviours'],
      ['2.3.6', 'Make associations between books with similar characters'],
      ['2.3.7', 'Explain reasons in a storyline'],
    ]),
  },
  {
    id: 'pn-2.4', code: '2.4', label: 'Emergent Literacy - Develop from Mark Making to Initial Stages of Writing',
    categoryId: codeToCategory('2.4'), grade: 'pre-nursery',
    subGoals: sg('pn-2.4', [
      ['2.4.1', 'Give meaning to marks made'],
      ['2.4.2', 'Draw straight and curved lines'],
      ['2.4.3', 'Form recognisable shapes as representations of an object'],
      ['2.4.4', 'Draw with increasing details'],
      ['2.4.5', 'Demonstrate understanding that print has meaning'],
    ]),
  },
  {
    id: 'pn-3.1', code: '3.1', label: 'Think Scientifically through Exploration and Discovery',
    categoryId: codeToCategory('3.1'), grade: 'pre-nursery',
    subGoals: sg('pn-3.1', [
      ['3.1.1', 'Show interest in the natural world'],
      ['3.1.2', 'Explore and investigate the environment'],
      ['3.1.3', 'Share observations and ideas about the natural world'],
      ['3.1.4', 'Begin to learn to operate simple mechanisms'],
      ['3.1.5', 'Operate digital tools'],
    ]),
  },
  {
    id: 'pn-3.2', code: '3.2', label: 'Think Critically and Creatively to Solve Problems',
    categoryId: codeToCategory('3.2'), grade: 'pre-nursery',
    subGoals: sg('pn-3.2', [
      ['3.2.1', 'Try different ways to solve a problem'],
      ['3.2.2', 'Use tools in novel ways to solve problems'],
    ]),
  },
  {
    id: 'pn-3.3', code: '3.3', label: 'Think Mathematically',
    categoryId: codeToCategory('3.3'), grade: 'pre-nursery',
    subGoals: sg('pn-3.3', [
      ['3.3.1', 'Begin to compare'],
      ['3.3.2', 'Use simple mathematical language to compare'],
      ['3.3.3', 'Take part in fingerplay stories, songs and rhymes with numbers'],
      ['3.3.4', 'Independently says numbers'],
      ['3.3.5', 'Engage in counting-like behaviour'],
      ['3.3.6', 'Count by rote'],
      ['3.3.7', 'Begin to understand rational counting'],
      ['3.3.9', 'Begin to remember their way around familiar environments'],
      ['3.3.10', 'Begin to understand the relationship between shapes and space'],
      ['3.3.11', 'Use simple mathematical language to describe space and position'],
      ['3.3.12', 'Recognise basic shapes'],
      ['3.3.13', 'Recognise that two objects have the same shape'],
      ['3.3.14', 'Recognise patterns in the environment'],
      ['3.3.15', 'Repeat patterns'],
      ['3.3.16', 'Anticipate some occurrences in the day'],
      ['3.3.17', 'Use mathematical language to talk about time'],
      ['3.3.18', 'Display understanding of payment transactions'],
    ]),
  },
  {
    id: 'pn-4.1', code: '4.1', label: 'Develop Gross Motor Skills',
    categoryId: codeToCategory('4.1'), grade: 'pre-nursery',
    subGoals: sg('pn-4.1', [
      ['4.1.1', 'Stop and change direction'],
      ['4.1.2', 'Run a few steps'],
      ['4.1.3', 'Walk up and down stairs with two feet placed on each step with support'],
      ['4.1.4', 'Walk up and down stairs with alternating feet for each step with support'],
      ['4.1.5', 'Jump'],
      ['4.1.6', 'Jump down from a low object'],
      ['4.1.7', 'Jump forward'],
      ['4.1.8', 'Ride on wheeled toys with increasing co-ordination'],
      ['4.1.9', 'Demonstrate stability when changing positions'],
      ['4.1.10', 'Demonstrate mobility with co-ordination'],
      ['4.1.11', 'Stand on one leg and hold this pose'],
      ['4.1.12', 'Maintain balance whilst running'],
      ['4.1.13', 'Kick'],
      ['4.1.14', 'Throw with increasing accuracy'],
      ['4.1.15', 'Catch with both hands by grasping object close to chest'],
    ]),
  },
  {
    id: 'pn-4.2', code: '4.2', label: 'Develop Fine Motor Skills',
    categoryId: codeToCategory('4.2'), grade: 'pre-nursery',
    subGoals: sg('pn-4.2', [
      ['4.2.1', 'Demonstrate eye-hand co-ordination'],
    ]),
  },
  {
    id: 'pn-4.3', code: '4.3', label: 'Develop Safe and Healthy Habits',
    categoryId: codeToCategory('4.3'), grade: 'pre-nursery',
    subGoals: sg('pn-4.3', [
      ['4.3.1', 'Use gestures and body language to convey needs'],
      ['4.3.2', 'Follow health and safety practices'],
      ['4.3.3', 'Practise healthy eating habits'],
      ['4.3.4', 'Begin to develop an understanding of healthy food'],
    ]),
  },
  {
    id: 'pn-5.1', code: '5.1', label: 'Explore Ways to Express Themselves through the Visual Arts',
    categoryId: codeToCategory('5.1'), grade: 'pre-nursery',
    subGoals: sg('pn-5.1', [
      ['5.1.1', 'Explore the elements of visual art'],
      ['5.1.2', 'Select material(s) to make their creation'],
      ['5.1.3', "Attribute meaning to their and others' creations"],
    ]),
  },
  {
    id: 'pn-5.2', code: '5.2', label: 'Explore Ways to Express Themselves through the Performing Arts',
    categoryId: codeToCategory('5.2'), grade: 'pre-nursery',
    subGoals: sg('pn-5.2', [
      ['5.2.1', 'Move to music'],
      ['5.2.2', 'Sing'],
      ['5.2.3', 'Explore and use a variety of musical resources'],
      ['5.2.4', 'Act roles and do actions'],
      ['5.2.5', 'Move in time with the music'],
      ['5.2.6', 'Reproduce a rhythm'],
      ['5.2.7', 'Begin to interpret music'],
    ]),
  },
  {
    id: 'pn-6.1', code: '6.1', label: 'Assume Responsibility and Take Action',
    categoryId: codeToCategory('6.1'), grade: 'pre-nursery',
    subGoals: sg('pn-6.1', [
      ['6.1.1', 'Adopt green practices (for sustainability)'],
      ['6.1.2', 'Remind others to use green practices (for sustainability)'],
      ['6.1.3', 'Recognise conflict situations and seek support to resolve them'],
    ]),
  },
];

// ─── Nursery 1 (same labels as Pre-Nursery) ──────────────────────────────────
const NURSERY1_GOALS: LearningGoalDef[] = PRE_NURSERY_GOALS.map((g) => ({
  ...g,
  id: g.id.replace(/^pn-/, 'n1-'),
  grade: 'nursery1' as Grade,
  subGoals: g.subGoals.map((sg) => ({ ...sg, id: sg.id.replace(/^pn-/, 'n1-') })),
}));

// ─── Nursery 2 ───────────────────────────────────────────────────────────────
const NURSERY2_GOALS: LearningGoalDef[] = [
  {
    id: 'n2-1.1', code: '1.1', label: 'Develop Self-awareness',
    categoryId: 'social', grade: 'nursery2',
    subGoals: sg('n2-1.1', [
      ['1.1.1', 'Recognise that they are part of various socio-cultural groups'],
      ['1.1.2', 'Develop self-confidence'],
    ]),
  },
  {
    id: 'n2-1.2', code: '1.2', label: 'Develop Emotional Intelligence',
    categoryId: 'social', grade: 'nursery2',
    subGoals: sg('n2-1.2', [
      ['1.2.1', "Identify own and others' emotions"],
      ['1.2.2', 'Use appropriate ways to express their emotions'],
    ]),
  },
  {
    id: 'n2-1.3', code: '1.3', label: 'Build Relationships with Family, Peers and Adults',
    categoryId: 'social', grade: 'nursery2',
    subGoals: sg('n2-1.3', [
      ['1.3.1', 'Develop an awareness that people have different backgrounds, abilities and needs'],
      ['1.3.2', 'Express appreciation when given something'],
      ['1.3.3', 'Use conversational skills'],
      ['1.3.4', 'Use strategies to establish relationships'],
    ]),
  },
  {
    id: 'n2-2.1', code: '2.1', label: 'Communicate through Spoken Language',
    categoryId: 'communicator', grade: 'nursery2',
    subGoals: sg('n2-2.1', [
      ['2.1.1', 'Ask and answer most wh- questions appropriately'],
      ['2.1.2', 'Give a simple recount'],
      ['2.1.3', 'Follow 3-part instructions'],
      ['2.1.4', 'Speak using generally comprehensible pronunciation'],
      ['2.1.5', 'Pronounce /f/ as in if and most speech sounds accurately'],
      ['2.1.6', 'Pronounce /l/ as in lay, /sh/ as in she, /ch/ as in chew, and most speech sounds accurately'],
      ['2.1.7', 'Use negations'],
      ['2.1.8', 'Use personal pronouns'],
      ['2.1.9', 'Speak using sentences of 5 to 6 words'],
    ]),
  },
  {
    id: 'n2-2.2', code: '2.2', label: 'Understand Written Language',
    categoryId: 'communicator', grade: 'nursery2',
    subGoals: sg('n2-2.2', [
      ['2.2.1', 'Identify words that rhyme'],
      ['2.2.2', 'Identify beginning sounds in words'],
      ['2.2.3', 'Identify syllables'],
      ['2.2.4', 'Recognise that letters have upper- and lower-case'],
      ['2.2.5', 'Know that sounds are associated with the letters of the alphabet and produce some of the sounds'],
      ['2.2.6', 'Begin to use knowledge of sounds (phonemes) to read Vowel-Consonant (VC) words'],
      ['2.2.7', 'Develop awareness that there are different types of texts'],
      ['2.2.8', 'Use images to support understanding of text'],
      ['2.2.9', 'Know that information can be communicated through signs and symbols'],
    ]),
  },
  {
    id: 'n2-2.3', code: '2.3', label: 'Produce Written Language',
    categoryId: 'communicator', grade: 'nursery2',
    subGoals: sg('n2-2.3', [
      ['2.3.1', 'Write the first letter of own name'],
      ['2.3.2', 'Copy letters of the alphabet'],
      ['2.3.3', 'Use symbols or letter-like shapes to represent writing'],
    ]),
  },
  {
    id: 'n2-3.1', code: '3.1', label: 'Think Critically and Creatively',
    categoryId: 'thinking', grade: 'nursery2',
    subGoals: sg('n2-3.1', [
      ['3.1.1', 'Ask questions to gather information'],
      ['3.1.2', 'Use simple logic to reach a conclusion'],
      ['3.1.3', 'Plan 1 stage at a time'],
      ['3.1.4', 'Generate ideas in response to prompts'],
    ]),
  },
  {
    id: 'n2-3.2', code: '3.2', label: 'Use Scientific Research to Make Sense of the World',
    categoryId: 'thinking', grade: 'nursery2',
    subGoals: sg('n2-3.2', [
      ['3.2.1', 'Make observations'],
      ['3.2.2', 'Make a hypothesis with support based only on immediate observations'],
      ['3.2.3', 'Carry out research including experiments'],
      ['3.2.4', 'Record data using photos, videos or mark-making'],
    ]),
  },
  {
    id: 'n2-3.3', code: '3.3', label: 'Think Mathematically - Develop Counting Skills and Number Sense',
    categoryId: 'thinking', grade: 'nursery2',
    subGoals: sg('n2-3.3', [
      ['3.3.1', 'Rote count to at least 5'],
      ['3.3.2', 'Count up to 5 items, 1 at a time; recognising that the last number said represents the total amount in the group'],
      ['3.3.3', 'Develop fast recognition of up to 3 items, without having to count them individually'],
      ['3.3.4', 'Read numerals 1 to 5'],
      ['3.3.5', 'Use symbols or numeral-like shapes to represent numerals'],
    ]),
  },
  {
    id: 'n2-3.4', code: '3.4', label: 'Think Mathematically - Understand Relationships and Patterns',
    categoryId: 'thinking', grade: 'nursery2',
    subGoals: sg('n2-3.4', [
      ['3.4.1', 'Match items'],
      ['3.4.2', 'Sort items by teacher-determined attribute'],
      ['3.4.3', 'Compare items by at least 1 attribute'],
      ['3.4.4', 'Visually compare the quantities of 2 groups of items'],
      ['3.4.5', 'Copy and continue complex patterns'],
    ]),
  },
  {
    id: 'n2-3.5', code: '3.5', label: 'Think Mathematically - Develop Measurement Skills',
    categoryId: 'thinking', grade: 'nursery2',
    subGoals: sg('n2-3.5', [
      ['3.5.1', 'Know that time can be measured'],
      ['3.5.2', 'Identify parts of the day'],
      ['3.5.3', 'Explore measurement instruments'],
    ]),
  },
  {
    id: 'n2-3.6', code: '3.6', label: 'Think Mathematically - Understand Basic Shapes and Spatial Concepts',
    categoryId: 'thinking', grade: 'nursery2',
    subGoals: sg('n2-3.6', [
      ['3.6.1', 'Identify the 4 basic shapes'],
      ['3.6.2', 'Combine basic shapes to form other shapes or figures'],
      ['3.6.3', 'Understand and use language relating to position and direction'],
    ]),
  },
  {
    id: 'n2-4.1', code: '4.1', label: 'Demonstrate Control, Coordination and Balance when using Gross Motor Skills',
    categoryId: 'physical', grade: 'nursery2',
    subGoals: sg('n2-4.1', [
      ['4.1.1', 'Demonstrate static balance'],
      ['4.1.2', 'Demonstrate dynamic balance'],
      ['4.1.3', 'Demonstrate rotational movements around different axes of their body'],
      ['4.1.4', 'Walk up and down stairs using alternate feet'],
      ['4.1.5', 'Run whilst swinging arms'],
      ['4.1.6', 'Jump down from a low platform'],
      ['4.1.7', 'Jump for height'],
      ['4.1.8', 'Jump a distance with body leaning forward'],
      ['4.1.9', 'Step sideways'],
      ['4.1.10', 'Hop'],
      ['4.1.11', 'Gallop'],
      ['4.1.12', 'Roll an object towards a target'],
      ['4.1.13', 'Throw an object towards a target using an underarm throw'],
      ['4.1.14', 'Do a two-handed throw'],
      ['4.1.15', 'Throw an object towards a target using an overarm throw'],
      ['4.1.16', 'Catch with both hands'],
      ['4.1.17', 'Kick'],
      ['4.1.18', 'Strike a stationary object with an implement'],
      ['4.1.19', 'Bounce a ball'],
    ]),
  },
  {
    id: 'n2-4.2', code: '4.2', label: 'Demonstrate Control and Coordination when using Fine Motor Skills',
    categoryId: 'physical', grade: 'nursery2',
    subGoals: sg('n2-4.2', [
      ['4.2.1', 'Use a four-finger grip'],
      ['4.2.2', 'Demonstrate eye-hand coordination'],
    ]),
  },
  {
    id: 'n2-4.3', code: '4.3', label: 'Develop Healthy Habits and Safety Awareness',
    categoryId: 'physical', grade: 'nursery2',
    subGoals: sg('n2-4.3', [
      ['4.3.1', 'Practise self-care'],
      ['4.3.2', 'Demonstrate behaviours that promote individual and group safety'],
    ]),
  },
  {
    id: 'n2-5.1', code: '5.1', label: 'Express Themselves in a Variety of Ways through the Visual Arts',
    categoryId: 'arts', grade: 'nursery2',
    subGoals: sg('n2-5.1', [
      ['5.1.1', 'Identify elements of visual art in artworks, and built and natural environments'],
      ['5.1.2', 'Explore elements of visual art to express ideas and feelings'],
      ['5.1.3', 'Explore a variety of media, tools and techniques to create 2- and 3-dimensional art'],
    ]),
  },
  {
    id: 'n2-5.2', code: '5.2', label: 'Interpret Visual Artworks',
    categoryId: 'arts', grade: 'nursery2',
    subGoals: sg('n2-5.2', [
      ['5.2.1', 'Explore artworks from different cultures'],
      ['5.2.2', 'State what an artwork represents'],
    ]),
  },
  {
    id: 'n2-5.3', code: '5.3', label: 'Express Themselves in a Variety of Ways through the Performing Arts',
    categoryId: 'arts', grade: 'nursery2',
    subGoals: sg('n2-5.3', [
      ['5.3.1', 'Develop an awareness of the elements of music'],
      ['5.3.2', 'Do simple dance steps'],
      ['5.3.3', 'Use facial expressions, gestures and/or movements to portray actions and feelings in response to a stimulus'],
    ]),
  },
  {
    id: 'n2-5.4', code: '5.4', label: 'Interpret Performances',
    categoryId: 'arts', grade: 'nursery2',
    subGoals: sg('n2-5.4', [
      ['5.4.1', 'Explore performances from different cultures'],
      ['5.4.2', 'Identify some of the features of a performance'],
    ]),
  },
  {
    id: 'n2-6.1', code: '6.1', label: 'Assume Responsibility and Take Action',
    categoryId: 'change', grade: 'nursery2',
    subGoals: sg('n2-6.1', [
      ['6.1.1', 'Take responsibility for their belongings'],
      ['6.1.2', 'Care for living and non-living things'],
      ['6.1.3', 'Ask for support to manage conflict'],
    ]),
  },
  {
    id: 'n2-6.2', code: '6.2', label: 'Develop a Sense of Environmental Responsibility',
    categoryId: 'change', grade: 'nursery2',
    subGoals: sg('n2-6.2', [
      ['6.2.1', 'Adopt daily habits to practise sustainability'],
      ['6.2.2', 'Develop an understanding that actions may have consequences that are not immediately apparent'],
    ]),
  },
];

// ─── Kindergarten 1 ──────────────────────────────────────────────────────────
const KINDERGARTEN1_GOALS: LearningGoalDef[] = [
  {
    id: 'k1-1.1', code: '1.1', label: 'Develop Self-awareness',
    categoryId: 'social', grade: 'kindergarten1',
    subGoals: sg('k1-1.1', [
      ['1.1.1', 'Recognise that they are part of various socio-cultural groups'],
      ['1.1.2', 'Develop self-confidence'],
    ]),
  },
  {
    id: 'k1-1.2', code: '1.2', label: 'Develop Emotional Intelligence',
    categoryId: 'social', grade: 'kindergarten1',
    subGoals: sg('k1-1.2', [
      ['1.2.1', 'Talk about emotions and suggest reasons for feeling a particular way'],
      ['1.2.2', 'Use basic strategies to manage emotions'],
    ]),
  },
  {
    id: 'k1-1.3', code: '1.3', label: 'Build Relationships with Family, Peers and Adults',
    categoryId: 'social', grade: 'kindergarten1',
    subGoals: sg('k1-1.3', [
      ['1.3.1', 'Respond appropriately to people around them who may have different needs'],
      ['1.3.2', 'Express appreciation when others offer assistance or support'],
      ['1.3.3', 'Use conversational skills'],
      ['1.3.4', 'Use strategies to maintain relationships'],
    ]),
  },
  {
    id: 'k1-2.1', code: '2.1', label: 'Communicate through Spoken Language',
    categoryId: 'communicator', grade: 'kindergarten1',
    subGoals: sg('k1-2.1', [
      ['2.1.1', 'Ask and answer why and how questions appropriately'],
      ['2.1.2', 'Sequence and describe steps or events'],
      ['2.1.3', 'Understand and use time-related words'],
      ['2.1.4', 'Speak using comprehensible pronunciation'],
      ['2.1.5', 'Pronounce /j/ as in jaw, /s/ as in so and /z/ as in zoo, and most speech sounds accurately'],
      ['2.1.6', 'Pronounce /r/ as in red and most speech sounds accurately'],
      ['2.1.7', 'Use past and future tenses generally correctly'],
      ['2.1.8', 'Use a range of sentence structures'],
    ]),
  },
  {
    id: 'k1-2.2', code: '2.2', label: 'Understand Written Language',
    categoryId: 'communicator', grade: 'kindergarten1',
    subGoals: sg('k1-2.2', [
      ['2.2.1', 'Identify words that rhyme'],
      ['2.2.2', 'Identify beginning sounds in words including digraphs and blends'],
      ['2.2.3', 'Identify ending sounds in words including digraphs and blends'],
      ['2.2.4', 'Identify middle sounds in words'],
      ['2.2.5', 'Produce words with the same beginning sound'],
      ['2.2.6', 'Produce words with the same ending sound'],
      ['2.2.7', 'Blend and segment onset and rime in single syllable words'],
      ['2.2.8', 'Blend 3 to 4 sounds to make a word'],
      ['2.2.9', 'Segment a word into 3 to 4 sounds'],
      ['2.2.10', 'Understand 1 to 1 correspondence between written and spoken words'],
      ['2.2.11', 'Recognise all upper- and lower-case letters of the alphabet and the most common sound that each letter represents'],
      ['2.2.12', 'Use knowledge of sounds (phonemes) to read Consonant-Vowel-Consonant (CVC) words'],
      ['2.2.13', 'Use knowledge of sounds (phonemes) to read Consonant-Vowel-Consonant-Consonant (CVCC) and Consonant-Consonant-Vowel-Consonant (CCVC) words'],
      ['2.2.14', 'Begin to link sounds to some frequently used digraphs'],
      ['2.2.15', 'Recognise some sight words'],
      ['2.2.16', 'Know that there are different types of texts for different purposes'],
      ['2.2.17', 'Use images and some words of the text to guess words and phrases'],
      ['2.2.18', 'Know that upper-case letters are used to start a sentence and sentences end with a full stop'],
      ['2.2.19', 'Know that there are many different sources of information'],
    ]),
  },
  {
    id: 'k1-2.3', code: '2.3', label: 'Produce Written Language',
    categoryId: 'communicator', grade: 'kindergarten1',
    subGoals: sg('k1-2.3', [
      ['2.3.1', 'Write their first name'],
      ['2.3.2', 'Write upper- and lower-case letters of the alphabet, most of which are correctly formed and aligned'],
      ['2.3.3', 'Copy words, phrases or sentences'],
      ['2.3.4', 'Write words and phrases using some invented spelling'],
      ['2.3.5', 'Write the days of the week'],
      ['2.3.6', 'Write short sentences using some invented spelling'],
      ['2.3.7', 'Use articles in sentences'],
      ['2.3.8', 'Use simple connectives to write longer sentences'],
      ['2.3.9', 'Create written text for a range of purposes'],
      ['2.3.10', 'Collaborate to create written text'],
      ['2.3.11', 'Use feedback to edit written texts'],
    ]),
  },
  {
    id: 'k1-3.1', code: '3.1', label: 'Think Critically and Creatively',
    categoryId: 'thinking', grade: 'kindergarten1',
    subGoals: sg('k1-3.1', [
      ['3.1.1', 'Ask questions to explore information'],
      ['3.1.2', 'Use logic to reach a conclusion'],
      ['3.1.3', 'Make a simple plan (2 to 3 stages)'],
      ['3.1.4', 'Generate new ideas and solutions by modifying ideas'],
    ]),
  },
  {
    id: 'k1-3.2', code: '3.2', label: 'Use Scientific Research to Make Sense of the World',
    categoryId: 'thinking', grade: 'kindergarten1',
    subGoals: sg('k1-3.2', [
      ['3.2.1', 'Make observations'],
      ['3.2.2', 'Make a hypothesis based only on immediate observations'],
      ['3.2.3', 'Carry out research including experiments'],
      ['3.2.4', 'Record data using words and simple tables'],
    ]),
  },
  {
    id: 'k1-3.3', code: '3.3', label: 'Think Mathematically - Develop Counting Skills and Number Sense',
    categoryId: 'thinking', grade: 'kindergarten1',
    subGoals: sg('k1-3.3', [
      ['3.3.1', 'Rote count to at least 10'],
      ['3.3.2', 'Rote count backwards from 10 to 0'],
      ['3.3.3', 'Count reliably up to 10 items'],
      ['3.3.4', 'Develop fast recognition of up to 5 items, without having to count them individually'],
      ['3.3.5', 'Read numerals 0 to 10'],
      ['3.3.6', 'Write numerals 0 to 10'],
      ['3.3.7', 'Understand and use ordinal numbers from first to fifth'],
      ['3.3.8', 'Know number bonds up to 10'],
      ['3.3.9', 'Add whole numbers (within 10)'],
      ['3.3.10', 'Subtract whole numbers (within 10)'],
    ]),
  },
  {
    id: 'k1-3.4', code: '3.4', label: 'Think Mathematically - Understand Relationships and Patterns',
    categoryId: 'thinking', grade: 'kindergarten1',
    subGoals: sg('k1-3.4', [
      ['3.4.1', 'Sort items including by child-determined attribute'],
      ['3.4.2', 'Compare items by at least 1 attribute'],
      ['3.4.3', 'Compare the quantities of 2 groups of items by counting'],
      ['3.4.4', 'Create complex patterns'],
    ]),
  },
  {
    id: 'k1-3.5', code: '3.5', label: 'Think Mathematically - Develop Measurement Skills',
    categoryId: 'thinking', grade: 'kindergarten1',
    subGoals: sg('k1-3.5', [
      ['3.5.1', 'Use some tools to measure time'],
      ['3.5.2', 'Know units of time'],
      ['3.5.3', 'Measure using non-standard units'],
      ['3.5.4', 'Select an appropriate instrument to measure'],
    ]),
  },
  {
    id: 'k1-3.6', code: '3.6', label: 'Think Mathematically - Understand Basic Shapes and Spatial Concepts',
    categoryId: 'thinking', grade: 'kindergarten1',
    subGoals: sg('k1-3.6', [
      ['3.6.1', 'Identify a variety of 2D and 3D shapes'],
      ['3.6.2', 'State the attributes of the 4 basic shapes'],
      ['3.6.3', 'Combine or partition shapes to form other shapes'],
      ['3.6.4', 'Understand that an object or shape can be split into equal or unequal parts'],
      ['3.6.5', 'Understand that left and right refers to sides'],
      ['3.6.6', 'Understand and use language relating to position, direction and distance'],
    ]),
  },
  {
    id: 'k1-4.1', code: '4.1', label: 'Demonstrate Control, Coordination and Balance when using Gross Motor Skills',
    categoryId: 'physical', grade: 'kindergarten1',
    subGoals: sg('k1-4.1', [
      ['4.1.1', 'Demonstrate static balance'],
      ['4.1.2', 'Demonstrate dynamic balance'],
      ['4.1.3', 'Demonstrate rotational movements around different axes of their body'],
      ['4.1.4', 'Leap'],
      ['4.1.5', 'Jump with two-foot take-off for height'],
      ['4.1.6', 'Jump a distance with a backward-upward arm swing'],
      ['4.1.7', 'Slide sideways'],
      ['4.1.8', 'Hop'],
      ['4.1.9', 'Gallop'],
      ['4.1.10', 'Roll an object and hit a target'],
      ['4.1.11', 'Use underarm throw and hit different targets'],
      ['4.1.12', 'Do a two-handed throw'],
      ['4.1.13', 'Use overarm throw and hit different targets'],
      ['4.1.14', 'Catch with both hands'],
      ['4.1.15', 'Kick'],
      ['4.1.16', 'Dribble with foot'],
      ['4.1.17', 'Strike a moving object with an implement'],
      ['4.1.18', 'Bounce a ball'],
      ['4.1.19', 'Dribble with hand'],
      ['4.1.20', 'Dribble with a long implement'],
    ]),
  },
  {
    id: 'k1-4.2', code: '4.2', label: 'Demonstrate Control and Coordination when using Fine Motor Skills',
    categoryId: 'physical', grade: 'kindergarten1',
    subGoals: sg('k1-4.2', [
      ['4.2.1', 'Use a tripod grip'],
      ['4.2.2', 'Demonstrate eye-hand coordination'],
    ]),
  },
  {
    id: 'k1-4.3', code: '4.3', label: 'Develop Healthy Habits and Safety Awareness',
    categoryId: 'physical', grade: 'kindergarten1',
    subGoals: sg('k1-4.3', [
      ['4.3.1', 'Practise self-care'],
      ['4.3.2', 'Demonstrate behaviours that promote individual and group safety'],
    ]),
  },
  {
    id: 'k1-5.1', code: '5.1', label: 'Express Themselves in a Variety of Ways through the Visual Arts',
    categoryId: 'arts', grade: 'kindergarten1',
    subGoals: sg('k1-5.1', [
      ['5.1.1', 'Describe elements of visual art in artworks, and built and natural environments'],
      ['5.1.2', 'Use elements of visual art to express ideas and feelings'],
      ['5.1.3', 'Use a variety of media, tools and techniques to create 2- and 3-dimensional art'],
    ]),
  },
  {
    id: 'k1-5.2', code: '5.2', label: 'Interpret Visual Artworks',
    categoryId: 'arts', grade: 'kindergarten1',
    subGoals: sg('k1-5.2', [
      ['5.2.1', 'Identify the culture from which different artworks originate'],
      ['5.2.2', 'Describe what an artwork represents'],
    ]),
  },
  {
    id: 'k1-5.3', code: '5.3', label: 'Express Themselves in a Variety of Ways through the Performing Arts',
    categoryId: 'arts', grade: 'kindergarten1',
    subGoals: sg('k1-5.3', [
      ['5.3.1', 'Explore the elements of music'],
      ['5.3.2', 'Perform a simple dance routine'],
      ['5.3.3', 'Use facial expressions, gestures and/or movements to portray actions, ideas, and feelings in response to a stimulus'],
    ]),
  },
  {
    id: 'k1-5.4', code: '5.4', label: 'Interpret Performances',
    categoryId: 'arts', grade: 'kindergarten1',
    subGoals: sg('k1-5.4', [
      ['5.4.1', 'Identify the culture from which performances originate'],
      ['5.4.2', 'Describe some of the features of a performance'],
    ]),
  },
  {
    id: 'k1-6.1', code: '6.1', label: 'Assume Responsibility and Take Action',
    categoryId: 'change', grade: 'kindergarten1',
    subGoals: sg('k1-6.1', [
      ['6.1.1', 'Take responsibility for their actions'],
      ['6.1.2', 'Care for living and non-living things'],
      ['6.1.3', 'Use suggested strategies to manage conflict'],
    ]),
  },
  {
    id: 'k1-6.2', code: '6.2', label: 'Develop a Sense of Environmental Responsibility',
    categoryId: 'change', grade: 'kindergarten1',
    subGoals: sg('k1-6.2', [
      ['6.2.1', 'Identify some of the Earth\'s resources and how they are used'],
      ['6.2.2', 'Develop an understanding that actions may have consequences they may not witness'],
    ]),
  },
];

// ─── Kindergarten 2 ──────────────────────────────────────────────────────────
const KINDERGARTEN2_GOALS: LearningGoalDef[] = [
  {
    id: 'k2-1.1', code: '1.1', label: 'Develop Self-awareness',
    categoryId: 'social', grade: 'kindergarten2',
    subGoals: sg('k2-1.1', [
      ['1.1.1', 'Recognise that they are part of various socio-cultural groups'],
      ['1.1.2', 'Develop self-confidence'],
    ]),
  },
  {
    id: 'k2-1.2', code: '1.2', label: 'Develop Emotional Intelligence',
    categoryId: 'social', grade: 'kindergarten2',
    subGoals: sg('k2-1.2', [
      ['1.2.1', 'Demonstrate understanding that people display their emotions in different ways and act accordingly'],
      ['1.2.2', 'Begin to understand the impact of emotions, and therefore, recognise the need to control impulses'],
    ]),
  },
  {
    id: 'k2-1.3', code: '1.3', label: 'Build Relationships with Family, Peers and Adults',
    categoryId: 'social', grade: 'kindergarten2',
    subGoals: sg('k2-1.3', [
      ['1.3.1', 'Consider an event or incident from others\' perspectives'],
      ['1.3.2', 'Express appreciation for things people do on an ongoing basis'],
      ['1.3.3', 'Use conversational skills'],
      ['1.3.4', 'Use strategies to maintain relationships'],
    ]),
  },
  {
    id: 'k2-2.1', code: '2.1', label: 'Communicate through Spoken Language',
    categoryId: 'communicator', grade: 'kindergarten2',
    subGoals: sg('k2-2.1', [
      ['2.1.1', 'Narrate a story in sequence'],
      ['2.1.2', "Respond to some audience's cues while presenting"],
      ['2.1.3', 'Use appropriate intonation'],
      ['2.1.4', 'Speak using generally correct pronunciation'],
      ['2.1.5', 'Pronounce /v/ as in van and most speech sounds accurately'],
      ['2.1.6', 'Use conditional mood'],
      ['2.1.7', 'Use compound-complex sentences'],
    ]),
  },
  {
    id: 'k2-2.2', code: '2.2', label: 'Understand Written Language',
    categoryId: 'communicator', grade: 'kindergarten2',
    subGoals: sg('k2-2.2', [
      ['2.2.1', 'Substitute a sound to make a new or different word'],
      ['2.2.2', 'Use knowledge of sounds (phonemes) to read CVCC and CCVC words'],
      ['2.2.3', 'Use knowledge of sounds (phonemes) to read 2 syllable decodable words'],
      ['2.2.4', 'Link sounds to an increasing number of digraphs and trigraphs'],
      ['2.2.5', 'Sound the end of words when reading out loud'],
      ['2.2.6', 'Recognise an increasing number of sight words'],
      ['2.2.7', 'Develop awareness that different text types have different features'],
      ['2.2.8', 'Use phonic and language knowledge to make reasonable guesses when reading'],
      ['2.2.9', 'Understand the use of full stops, question marks and exclamation marks, and different uses of upper-case letters'],
      ['2.2.10', 'Begin to distinguish between opinion and fact'],
    ]),
  },
  {
    id: 'k2-2.3', code: '2.3', label: 'Produce Written Language',
    categoryId: 'communicator', grade: 'kindergarten2',
    subGoals: sg('k2-2.3', [
      ['2.3.1', 'Write their first and last name'],
      ['2.3.2', 'Write upper- and lower-case letters of the alphabet correctly and well-aligned'],
      ['2.3.3', 'Know how to use onset and rime to spell words'],
      ['2.3.4', 'Relate rhyme to shared spelling patterns'],
      ['2.3.5', 'Write the days of the week and months of the year'],
      ['2.3.6', 'Use conventional and some invented spelling'],
      ['2.3.7', 'Use simple connectives to write longer sentences'],
      ['2.3.8', 'Use articles correctly in sentences'],
      ['2.3.9', 'Write plural nouns with endings -s and -es'],
      ['2.3.10', 'Create written text for an increasing range of purposes'],
      ['2.3.11', 'Collaborate to create written text'],
      ['2.3.12', 'Use feedback to edit written texts for grammar, meaning, punctuation and spelling'],
    ]),
  },
  {
    id: 'k2-2.4', code: '2.4', label: 'Develop Pinyin Awareness',
    categoryId: 'communicator', grade: 'kindergarten2',
    subGoals: [],
  },
  {
    id: 'k2-3.1', code: '3.1', label: 'Think Critically and Creatively',
    categoryId: 'thinking', grade: 'kindergarten2',
    subGoals: sg('k2-3.1', [
      ['3.1.1', 'Ask questions to explore understandings'],
      ['3.1.2', 'Use logic to reach a reasonable conclusion'],
      ['3.1.3', 'Develop a detailed multi-stage plan'],
      ['3.1.4', 'Generate novel ideas'],
    ]),
  },
  {
    id: 'k2-3.2', code: '3.2', label: 'Use Scientific Research to Make Sense of the World',
    categoryId: 'thinking', grade: 'kindergarten2',
    subGoals: sg('k2-3.2', [
      ['3.2.1', 'Make observations'],
      ['3.2.2', 'Make a hypothesis based on immediate observations and prior knowledge'],
      ['3.2.3', 'Carry out research including experiments'],
      ['3.2.4', 'Record data using words, simple tables and graphs'],
    ]),
  },
  {
    id: 'k2-3.3', code: '3.3', label: 'Think Mathematically - Develop Counting Skills and Number Sense',
    categoryId: 'thinking', grade: 'kindergarten2',
    subGoals: sg('k2-3.3', [
      ['3.3.1', 'Rote count to at least 20'],
      ['3.3.2', 'Rote count in tens to 100'],
      ['3.3.3', 'Count backwards from any number within 20'],
      ['3.3.4', 'Count reliably up to 20 items'],
      ['3.3.5', 'Develop fast recognition of up to 10 items, without having to count them individually'],
      ['3.3.6', 'Read numerals 0 to 39'],
      ['3.3.7', 'Write numerals 0 to 39'],
      ['3.3.8', 'Read number words zero to twenty'],
      ['3.3.9', 'Write number words zero to twenty'],
      ['3.3.10', 'Understand and use ordinal numbers from first to tenth'],
      ['3.3.11', 'Know number bonds up to 20'],
      ['3.3.12', 'Understand that numbers 10 to 20 are made up of tens and ones'],
      ['3.3.13', 'Add and subtract whole numbers (within 20)'],
      ['3.3.14', 'Add doubles up to 20'],
    ]),
  },
  {
    id: 'k2-3.4', code: '3.4', label: 'Think Mathematically - Understand Relationships and Patterns',
    categoryId: 'thinking', grade: 'kindergarten2',
    subGoals: sg('k2-3.4', [
      ['3.4.1', 'Sort items by at least 2 attributes'],
      ['3.4.2', 'Put things in an order'],
      ['3.4.3', 'Explain patterns'],
    ]),
  },
  {
    id: 'k2-3.5', code: '3.5', label: 'Think Mathematically - Develop Measurement Skills',
    categoryId: 'thinking', grade: 'kindergarten2',
    subGoals: sg('k2-3.5', [
      ['3.5.1', 'Use an analogue clock or watch to tell time'],
      ['3.5.2', 'Know units of time'],
      ['3.5.3', 'Use an appropriate instrument to measure'],
    ]),
  },
  {
    id: 'k2-3.6', code: '3.6', label: 'Think Mathematically - Understand Basic Shapes and Spatial Concepts',
    categoryId: 'thinking', grade: 'kindergarten2',
    subGoals: sg('k2-3.6', [
      ['3.6.1', 'Use mathematical terms to state the attributes of 2D and 3D shapes'],
      ['3.6.2', 'Understand that dividing into 2 equal parts means dividing into halves'],
      ['3.6.3', 'Identify left and right correctly'],
      ['3.6.4', 'Describe position, direction, distance and orientation'],
      ['3.6.5', 'Understand that a shape can look different in different orientations'],
    ]),
  },
  {
    id: 'k2-4.1', code: '4.1', label: 'Demonstrate Control, Coordination and Balance when using Gross Motor Skills',
    categoryId: 'physical', grade: 'kindergarten2',
    subGoals: sg('k2-4.1', [
      ['4.1.1', 'Demonstrate static balance'],
      ['4.1.2', 'Demonstrate dynamic balance'],
      ['4.1.3', 'Demonstrate rotational movements around different axes of their body'],
      ['4.1.4', 'Leap'],
      ['4.1.5', 'Jump with a full body stretch for height'],
      ['4.1.6', 'Jump a distance with stable landing'],
      ['4.1.7', 'Slide sideways smoothly'],
      ['4.1.8', 'Hop'],
      ['4.1.9', 'Gallop'],
      ['4.1.10', 'Begin to skip'],
      ['4.1.11', 'Skip'],
      ['4.1.12', 'Roll an object and hit a target'],
      ['4.1.13', 'Use underarm throw and hit different targets'],
      ['4.1.14', 'Do a two-handed chest pass'],
      ['4.1.15', 'Use overarm throw and hit different targets'],
      ['4.1.16', 'Catch with both hands'],
      ['4.1.17', 'Kick'],
      ['4.1.18', 'Dribble with foot'],
      ['4.1.19', 'Strike a moving object with an implement'],
      ['4.1.20', 'Bounce a ball'],
      ['4.1.21', 'Dribble with hand'],
      ['4.1.22', 'Dribble with a long implement'],
    ]),
  },
  {
    id: 'k2-4.2', code: '4.2', label: 'Demonstrate Control and Coordination when using Fine Motor Skills',
    categoryId: 'physical', grade: 'kindergarten2',
    subGoals: sg('k2-4.2', [
      ['4.2.1', 'Use a tripod grip'],
      ['4.2.2', 'Demonstrate eye-hand coordination'],
    ]),
  },
  {
    id: 'k2-4.3', code: '4.3', label: 'Develop Healthy Habits and Safety Awareness',
    categoryId: 'physical', grade: 'kindergarten2',
    subGoals: sg('k2-4.3', [
      ['4.3.1', 'Practise self-care'],
      ['4.3.2', 'Demonstrate behaviours that promote individual and group safety'],
    ]),
  },
  {
    id: 'k2-5.1', code: '5.1', label: 'Express Themselves in a Variety of Ways through the Visual Arts',
    categoryId: 'arts', grade: 'kindergarten2',
    subGoals: sg('k2-5.1', [
      ['5.1.1', 'Observe and comment on the use of elements of visual art in artworks, and built and natural environments'],
      ['5.1.2', 'Experiment with elements of visual art to express ideas and feelings'],
      ['5.1.3', 'Experiment with a variety of media, tools and techniques to create 2- and 3-dimensional art'],
    ]),
  },
  {
    id: 'k2-5.2', code: '5.2', label: 'Interpret Visual Artworks',
    categoryId: 'arts', grade: 'kindergarten2',
    subGoals: sg('k2-5.2', [
      ['5.2.1', 'Explain how artworks are associated with different cultures'],
      ['5.2.2', 'Explain what an artwork represents'],
    ]),
  },
  {
    id: 'k2-5.3', code: '5.3', label: 'Express Themselves in a Variety of Ways through the Performing Arts',
    categoryId: 'arts', grade: 'kindergarten2',
    subGoals: sg('k2-5.3', [
      ['5.3.1', 'Experiment with the elements of music'],
      ['5.3.2', 'Perform a simple dance routine in time to music'],
      ['5.3.3', 'Use facial expressions, gestures and movements to portray characters'],
    ]),
  },
  {
    id: 'k2-5.4', code: '5.4', label: 'Interpret Performances',
    categoryId: 'arts', grade: 'kindergarten2',
    subGoals: sg('k2-5.4', [
      ['5.4.1', 'Explain how performances are associated with different cultures'],
      ['5.4.2', 'Explain what a performance represents, communicates or evokes'],
    ]),
  },
  {
    id: 'k2-6.1', code: '6.1', label: 'Assume Responsibility and Take Action',
    categoryId: 'change', grade: 'kindergarten2',
    subGoals: sg('k2-6.1', [
      ['6.1.1', 'Take responsibility for their own and others\' actions'],
      ['6.1.2', 'Care for living and non-living things'],
      ['6.1.3', 'Find ways to manage conflict'],
    ]),
  },
  {
    id: 'k2-6.2', code: '6.2', label: 'Develop a Sense of Environmental Responsibility',
    categoryId: 'change', grade: 'kindergarten2',
    subGoals: sg('k2-6.2', [
      ['6.2.1', 'Understand the need for sustainable practices'],
      ['6.2.2', 'Develop an understanding that actions in one place/time may have consequences in a different place/time'],
    ]),
  },
];

export const LEARNING_GOALS: LearningGoalDef[] = [
  ...PRE_NURSERY_GOALS,
  ...NURSERY1_GOALS,
  ...NURSERY2_GOALS,
  ...KINDERGARTEN1_GOALS,
  ...KINDERGARTEN2_GOALS,
];

export function getGoalsForGrade(grade: Grade): LearningGoalDef[] {
  return LEARNING_GOALS.filter((g) => g.grade === grade);
}

export function getGoalsForGradeAndCategory(grade: Grade, cat: CategoryId): LearningGoalDef[] {
  return LEARNING_GOALS.filter((g) => g.grade === grade && g.categoryId === cat);
}
