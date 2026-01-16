import { ModelTier } from './types';

// Common English words for typo detection (mini dictionary)
const COMMON_WORDS = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
    'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
    'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
    'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
    'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
    'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
    'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
    'is', 'are', 'was', 'were', 'been', 'being', 'has', 'had', 'does', 'did',
    'should', 'need', 'here', 'where', 'why', 'tell', 'let', 'help', 'may', 'might',
    'create', 'project', 'code', 'file', 'data', 'system', 'api', 'app', 'web', 'user',
    'please', 'thanks', 'yes', 'no', 'ok', 'okay', 'dont', 'wont', 'cant', 'im',
    'hey', 'hi', 'hello', 'sorry', 'sure', 'right', 'left', 'thing', 'things', 'stuff'
]);

// Technical terms that if misspelled, need 70B
const TECHNICAL_PATTERNS = [
    /extens\w*/i,      // extension
    /permis\w*/i,      // permission
    /constra\w*/i,     // constraint
    /automat\w*/i,     // automatic
    /webhook\w*/i,     // webhook
    /configur\w*/i,    // configuration
    /implement\w*/i,   // implementation
    /function\w*/i,    // function
    /paramet\w*/i,     // parameter
    /convert\w*/i,     // converter
    /document\w*/i,    // documentation
];

export class SemanticRouter {
    /**
     * Analyzes text complexity to determine optimal model tier.
     * Focus: Typo density, question complexity, sentence structure
     */
    static route(text: string): ModelTier {
        let score = 0;
        const THRESHOLD = 8;

        // ============================================
        // 1. TYPO DENSITY (Most Important)
        // ============================================
        const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        let unknownWords = 0;

        for (const word of words) {
            // Clean word of punctuation
            const cleanWord = word.replace(/[^a-z]/g, '');
            if (cleanWord.length > 2 && !COMMON_WORDS.has(cleanWord)) {
                unknownWords++;
            }
        }

        const typoDensity = words.length > 0 ? unknownWords / words.length : 0;

        if (typoDensity > 0.5) {
            score += 15; // More than 50% unknown words = very messy
        } else if (typoDensity > 0.3) {
            score += 8;  // 30-50% = moderately messy
        } else if (typoDensity > 0.2) {
            score += 4;  // 20-30% = somewhat messy
        }

        // ============================================
        // 2. QUESTION COMPLEXITY
        // ============================================
        const questionCount = (text.match(/\?/g) || []).length;

        if (questionCount >= 3) {
            score += 8;  // Multiple questions = complex intent
        } else if (questionCount >= 2) {
            score += 4;
        }

        // ============================================
        // 3. NESTED QUOTES (Very hard for 8B)
        // ============================================
        const hasNestedQuotes = /"[^"]*"[^"]*"/.test(text) ||
            /\"[^\"]*\"[^\"]*\"/.test(text) ||
            text.includes('"') && text.includes('"');

        if (hasNestedQuotes) {
            score += 10;
        }

        // ============================================
        // 4. RUN-ON SENTENCE DETECTION
        // ============================================
        // Split by sentence-ending punctuation
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

        for (const sentence of sentences) {
            const wordCount = sentence.trim().split(/\s+/).length;
            if (wordCount > 40) {
                score += 6; // Very long run-on sentence
                break;
            } else if (wordCount > 25) {
                score += 3;
                break;
            }
        }

        // ============================================
        // 5. MISSPELLED TECHNICAL TERMS
        // ============================================
        // Look for words that ALMOST match technical patterns
        let technicalMisspellings = 0;

        for (const word of words) {
            const cleanWord = word.replace(/[^a-z]/g, '');
            if (cleanWord.length < 4) continue;

            for (const pattern of TECHNICAL_PATTERNS) {
                // Check if word loosely matches but isn't exact
                if (pattern.test(cleanWord)) {
                    // Check if it's likely misspelled (has unusual char patterns)
                    if (/(.)\1{2,}/.test(cleanWord) || // Triple letters
                        /[aeiou]{3,}/.test(cleanWord) || // Triple vowels
                        /[bcdfghjklmnpqrstvwxyz]{4,}/.test(cleanWord)) { // 4+ consonants
                        technicalMisspellings++;
                    }
                }
            }
        }

        if (technicalMisspellings >= 2) {
            score += 8;
        }

        // ============================================
        // 6. LENGTH (Keep but reduce weight)
        // ============================================
        if (text.length > 1000) {
            score += 6;
        } else if (text.length > 500) {
            score += 3;
        }

        console.log(`[Crystal] Router: typo=${(typoDensity * 100).toFixed(0)}%, questions=${questionCount}, score=${score} → ${score >= THRESHOLD ? '70b' : '8b'}`);

        return score >= THRESHOLD ? '70b' : '8b';
    }
}
