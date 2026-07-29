import {gemini} from './gemini';
export async function askAI(question:string,context:string){
    const prompt = ` your are my personal ai assistant only answer using the provided context context: ${context} Quetion:${question}`   
    
    const result = await gemini.models.generateContent({
        model:'gemini-2.5-flash',
        contents: prompt,
    })
    return result.text;
}