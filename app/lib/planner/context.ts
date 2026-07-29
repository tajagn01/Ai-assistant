import { searchFiles } from "@/app/lib/github/search";
import { readFile } from "@/app/lib/github/read";
import { gemini } from "@/app/lib/ai/gemini";

async function extractSearchQuery(question: string): Promise<string> {
  try {
    const prompt = `Extract the core technical concepts or keywords from this question to search in a knowledge base. Remove all conversational words (like "what is", "how do", "explain", "about"). Return ONLY the search terms, without any punctuation, quotes, or introduction.
Question: ${question}`;

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return response.text?.trim() || question;
  } catch (error) {
    console.error("Error extracting search query:", error);
    return question;
  }
}

export async function buildContext(question: string) {
  const searchQuery = await extractSearchQuery(question);
  const files = await searchFiles(searchQuery);

  if (files.length === 0) {
    return "";
  }

  const sections: string[] = [];

  for (const file of files) {
    const markdown = await readFile(file.path);

    sections.push(
      `# Source: ${file.path}\n\n${markdown}`
    );
  }

  return sections.join("\n\n---\n\n");
}