
import { GoogleGenAI } from "@google/genai";

export const askHRAssistant = async (query: string) => {
  // Initialize Gemini with the API key from environment variables
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // Call generateContent with the gemini-3-pro-preview model for advanced reasoning tasks like labor law
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: query,
    config: {
      systemInstruction: "You are a specialized HR Assistant for a Malaysian Tuition Center. You have deep knowledge of Malaysia's Employment Act, EPF, SOCSO, EIS, and PCB (MTD) rules. Provide concise, accurate, and professional advice. Always mention that official LHDN/KWSP sites should be consulted for final verification.",
    },
  });
  // Return the extracted text response directly
  return response.text;
};
