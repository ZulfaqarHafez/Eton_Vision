export interface LearningGoal {
  goal: string;
  ksdStatement: string;
}

export interface LearningDomain {
  name: string;
  goals: LearningGoal[];
}

export interface ParsedReport {
  context: string;
  observation: string;
  learningDomains: LearningDomain[];
  raw: string;
}

// Known domain names in order
const DOMAIN_NAMES = [
  'The Social Child',
  'The Child as a Communicator',
  'The Thinking Child',
  'The Physical Child',
  'Creative Expression and Enjoyment through the Arts',
];

// Inline hex colors for each domain (matching reference design)
export const DOMAIN_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  'The Social Child':                                    { bg: '#FFF3EC', border: '#F4A46A', dot: '#E8845A' },
  'The Child as a Communicator':                         { bg: '#EEF6FF', border: '#7EB8E8', dot: '#4A90D9' },
  'The Thinking Child':                                  { bg: '#F0FFF4', border: '#68C98A', dot: '#38A05C' },
  'The Physical Child':                                  { bg: '#FFF8EC', border: '#E8C86A', dot: '#D4A017' },
  'Creative Expression and Enjoyment through the Arts':  { bg: '#FDF0FF', border: '#C47EE8', dot: '#A044D4' },
};

// Match a line to a known domain name (fuzzy startsWith)
function matchDomain(line: string): string | null {
  const trimmed = line.trim();
  for (const name of DOMAIN_NAMES) {
    if (trimmed.startsWith(name) || trimmed.toLowerCase().startsWith(name.toLowerCase())) {
      return name;
    }
    // Short match for "Creative Expression"
    if (name.startsWith('Creative') && trimmed.toLowerCase().startsWith('creative expression')) {
      return name;
    }
  }
  return null;
}

export function parseReport(raw: string): ParsedReport {
  const result: ParsedReport = {
    context: '',
    observation: '',
    learningDomains: [],
    raw,
  };

  // Strip leading/trailing dashes and whitespace
  const cleaned = raw.replace(/^---\s*/gm, '').replace(/\s*---$/gm, '');

  // Extract CONTEXT section
  const contextMatch = cleaned.match(/CONTEXT:\s*\n([\s\S]*?)(?=\nOBSERVATION:|$)/i);
  if (contextMatch) {
    result.context = contextMatch[1].trim();
  }

  // Extract OBSERVATION section
  const obsMatch = cleaned.match(/OBSERVATION:\s*\n([\s\S]*?)(?=\nLEARNING GOALS:|$)/i);
  if (obsMatch) {
    result.observation = obsMatch[1].trim();
  }

  // Extract LEARNING GOALS section
  const goalsMatch = cleaned.match(/LEARNING GOALS:\s*\n([\s\S]*?)$/i);
  if (!goalsMatch) return result;

  const goalsText = goalsMatch[1];
  const lines = goalsText.split('\n');

  let currentDomain: LearningDomain | null = null;
  let currentGoal = '';
  let currentKsd = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this line is a domain header
    const domain = matchDomain(trimmed);
    if (domain) {
      // Save previous domain if exists
      if (currentDomain) {
        if (currentGoal || currentKsd) {
          currentDomain.goals.push({ goal: currentGoal, ksdStatement: currentKsd });
        }
        result.learningDomains.push(currentDomain);
      }
      currentDomain = { name: domain, goals: [] };
      currentGoal = '';
      currentKsd = '';
      continue;
    }

    if (!currentDomain) continue;

    // Check if this is a learning goal line
    const goalMatch = trimmed.match(/^-?\s*Learning Goal:\s*(.*)/i);
    if (goalMatch) {
      // Save previous goal if exists
      if (currentGoal || currentKsd) {
        currentDomain.goals.push({ goal: currentGoal, ksdStatement: currentKsd });
      }
      currentGoal = goalMatch[1].trim();
      currentKsd = '';
      continue;
    }

    // Otherwise it's a KSD statement or continuation
    if (currentGoal) {
      currentKsd = currentKsd ? `${currentKsd} ${trimmed}` : trimmed;
    }
  }

  // Push the last domain
  if (currentDomain) {
    if (currentGoal || currentKsd) {
      currentDomain.goals.push({ goal: currentGoal, ksdStatement: currentKsd });
    }
    result.learningDomains.push(currentDomain);
  }

  return result;
}
