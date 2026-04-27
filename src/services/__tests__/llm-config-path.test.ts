import { getLLMConfig } from '../../services/geminiService';
import { doc } from 'firebase/firestore';

// Mock firebase modules
jest.mock('../../lib/firebase', () => ({
 db: {}
}));

jest.mock('firebase/firestore', () => ({
 doc: jest.fn(),
 getDoc: jest.fn().mockResolvedValue({ exists: () => false })
}));

describe('LLM Config Path Consistency', () => {
 beforeEach(() => {
 jest.clearAllMocks();
 });

 it('getLLMConfig reads from system_settings/llm_config', async () => {
 await getLLMConfig();
 expect(doc).toHaveBeenCalledWith(expect.anything(), 'system_settings', 'llm_config');
 });
});