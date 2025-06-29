const CHATGPT_API_URL = "https://api.openai.com/v1/engines/chatgpt-3-mini/completions";
const API_KEY = "PLACEHOLDER"; //TODO: 

/**
 * Sends a prompt to ChatGPT and returns the response.
 * @param prompt The string prompt to send to the API.
 * @returns The response from ChatGPT
 */
export async function sendPromptToChatGPT(prompt: string): Promise<string> {
    const response = await fetch(CHATGPT_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
            prompt,
            max_tokens: 100,
        }),
    });

    if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.text.trim() || "";
}

/**
  * Requests ChatGPT to find a link to a heading image for a given news article URL on the open internet.
  * @param articleURL The URL of the news article.
  * @returns The generated headline.
  */
export async function requestAIforNewsArticleRelatedImageURL(articleURL: string): Promise<string> {

    var prompt = `
    
    You are a meticulous, technically rigorous assistant tasked with locating exactly one valid, publicly accessible, fully-qualified direct image hyperlink relevant specifically to the content described by the following news article URL. Your task does NOT restrict you to images found on the article's webpage. Instead, you must carefully search and select from anywhere across the internet an image that:
      
    Directly and specifically relates to the subject of the news article.
    Clearly reflects the content of the article in a meaningful way.
    Is a valid, embeddable heading-style image (such as a headline image, representative thumbnail, or editorially appropriate news-related image).
    Must NOT be a placeholder, generic icon, unrelated graphic, or logo image.

    Your response must strictly adhere to these rules:

    ONLY respond with a single fully expanded URL string starting explicitly with "https://".
    Absolutely no other text, explanations, or commentary are permitted.
    If no suitable image is found after careful verification, explicitly reply only with "NO_VALID_IMAGE_FOUND".

    Relevant News Article URL:
    ${articleURL}

    Execute this task precisely.
    `;

    return sendPromptToChatGPT(prompt);
}
