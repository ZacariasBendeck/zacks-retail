import Anthropic from '@anthropic-ai/sdk';

export interface ImageAnalysisResult {
  shoe_type: string | null;
  heel_height: string | null;
  heel_shape: string | null;
  toe_shape: string | null;
  color_family: string | null;
  upper_material: string | null;
  finish: string | null;
  pattern: string | null;
  occasion: string | null;
  department: string | null;
  color: string | null;
  description: string | null;
  category: string | null;
}

const ANALYSIS_PROMPT = `You are an expert shoe product analyst. Analyze this shoe image and identify the following attributes. Return ONLY a JSON object with these keys — no markdown, no explanation:

{
  "shoe_type": "<type of shoe, e.g. Oxford, Pump, Sandal, Boot, Loafer, Sneaker, Flat, Mule, Wedge, Espadrille>",
  "heel_height": "<height category: Flat, Low (1-2in), Medium (2-3in), High (3-4in), Very High (4in+)>",
  "heel_shape": "<shape: Flat, Block, Stiletto, Kitten, Wedge, Platform, Cone, Spool, Stacked>",
  "toe_shape": "<shape: Pointed, Round, Square, Almond, Peep Toe, Open Toe>",
  "color_family": "<primary color family: Black, Brown, Tan, White, Red, Blue, Pink, Green, Gold, Silver, Multi, Nude, Navy, Burgundy>",
  "upper_material": "<material: Leather, Suede, Patent Leather, Synthetic, Canvas, Satin, Mesh, Velvet, Fabric>",
  "finish": "<finish: Matte, Glossy, Patent, Metallic, Distressed, Brushed, Natural>",
  "pattern": "<pattern: Solid, Two-Tone, Animal Print, Floral, Striped, Plaid, Embossed, Studded, Woven>",
  "occasion": "<occasion: Formal, Business, Casual, Evening, Party, Bridal, Athletic, Outdoor>",
  "department": "<one of: FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT>",
  "color": "<specific color name, e.g. Black, Cognac Brown, Wine Red>",
  "description": "<brief 1-2 sentence description of the shoe>",
  "category": "<product category, e.g. Pump Formal, Sandal Flat, Boot Ankle, Sneaker, Flat Ballet, Mule, Wedge, Espadrille, Oxford, Comfort Casual, Platform, Clog, Slide>"
}

If you cannot determine an attribute, set it to null.`;

export async function analyzeShoeImage(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<ImageAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const client = new Anthropic({ apiKey });

  const base64Image = imageBuffer.toString('base64');
  const mediaType = mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: ANALYSIS_PROMPT,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude Vision API');
  }

  const parsed = JSON.parse(textBlock.text) as ImageAnalysisResult;
  return parsed;
}
