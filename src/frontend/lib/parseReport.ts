export interface LearningAnalysisItem {
  category: string;
  description: string;
}

export interface ParsedReport {
  context: string;
  observation: string;
  learningAnalysis: LearningAnalysisItem[];
  raw: string;
}

// Known category names in display order
const CATEGORY_NAMES = [
  'Language & Literacy',
  'Creative Expression',
  'Cultural Awareness',
  'Collaboration & Social Skills',
  'Cognitive Development',
  'Fine Motor & Design Thinking',
];

// Inline hex colors for each category (matching Moments template design)
export const CATEGORY_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  'Language & Literacy':            { bg: '#EEF6FF', border: '#7EB8E8', dot: '#4A90D9' },
  'Creative Expression':            { bg: '#FDF0FF', border: '#C47EE8', dot: '#A044D4' },
  'Cultural Awareness':             { bg: '#FFF3EC', border: '#F4A46A', dot: '#E8845A' },
  'Collaboration & Social Skills':  { bg: '#F0FFF4', border: '#68C98A', dot: '#38A05C' },
  'Cognitive Development':          { bg: '#FFF8EC', border: '#E8C86A', dot: '#D4A017' },
  'Fine Motor & Design Thinking':   { bg: '#FFE8EE', border: '#E87E9E', dot: '#D44A6A' },
};

// Match a line to a known category name
function matchCategory(line: string): string | null {
  const trimmed = line.trim().replace(/:$/, '');
  for (const name of CATEGORY_NAMES) {
    if (trimmed.toLowerCase().startsWith(name.toLowerCase())) {
      return name;
    }
  }
  return null;
}

export function parseReport(raw: string): ParsedReport {
  const result: ParsedReport = {
    context: '',
    observation: '',
    learningAnalysis: [],
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
  const obsMatch = cleaned.match(/OBSERVATION:\s*\n([\s\S]*?)(?=\nLEARNING ANALYSIS:|$)/i);
  if (obsMatch) {
    result.observation = obsMatch[1].trim();
  }

  // Extract LEARNING ANALYSIS section
  const analysisMatch = cleaned.match(/LEARNING ANALYSIS:\s*\n([\s\S]*?)$/i);
  if (!analysisMatch) return result;

  const analysisText = analysisMatch[1];
  const lines = analysisText.split('\n');

  let currentCategory: string | null = null;
  let currentDescription = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this line starts with a category name
    // Format: "Category Name: description text"
    const category = matchCategory(trimmed);
    if (category) {
      // Save previous category if exists
      if (currentCategory && currentDescription) {
        result.learningAnalysis.push({
          category: currentCategory,
          description: currentDescription,
        });
      }
      currentCategory = category;
      // Extract description after "Category Name:"
      const colonIdx = trimmed.indexOf(':');
      currentDescription = colonIdx >= 0 ? trimmed.slice(colonIdx + 1).trim() : '';
      continue;
    }

    // Continuation line for current category
    if (currentCategory) {
      currentDescription = currentDescription
        ? `${currentDescription} ${trimmed}`
        : trimmed;
    }
  }

  // Push the last category
  if (currentCategory && currentDescription) {
    result.learningAnalysis.push({
      category: currentCategory,
      description: currentDescription,
    });
  }

  return result;
}
