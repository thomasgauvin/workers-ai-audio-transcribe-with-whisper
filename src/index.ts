import { Buffer } from 'node:buffer';

// Updated TypeScript interfaces for improved type safety
interface WhisperResponse {
	transcription_info: {
		language: string;
		language_probability: number;
		duration: number;
		duration_after_vad: number;
	};
	text: string;
	word_count: number;
	segments: {
		start: number;
		end: number;
		text: string;
		temperature: number;
		avg_logprob: number;
		compression_ratio: number;
		no_speech_prob: number;
		words?: {
			word: string;
			start: number;
			end: number;
		}[];
	}[];
	vtt: string;
}

interface Env {
	AI: any; // The AI binding
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		try {
			const url = new URL(request.url);

			// Check if it's a transcription request
			if (request.method === 'POST' && url.pathname === '/transcribe') {
				return await handleTranscription(request, env);
			}

			// Default response for unknown routes
			return new Response('Not found', { status: 404 });
		} catch (error) {
			return new Response(JSON.stringify({ error: (error as Error).message }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			});
		}
	},
} satisfies ExportedHandler<Env>;

async function handleTranscription(request: Request, env: Env): Promise<Response> {
	// Get the form data
	const formData = await request.formData();
	const submissionMethod = (formData.get('submissionMethod') as string) || 'base64';

	// Route to the appropriate handler based on submission method
	if (submissionMethod === 'file') {
		return await handleFileTranscription(formData, env);
	} else {
		return await handleBase64Transcription(formData, env);
	}
}

async function handleBase64Transcription(formData: FormData, env: Env): Promise<Response> {
	const language = (formData.get('language') as string) || 'en';
	const audioBase64 = formData.get('audioBase64') as string | '';

	if (!audioBase64) {
		return new Response(JSON.stringify({ error: 'No audio data provided' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	return await transcribeAudio(audioBase64, language, env);
}

async function handleFileTranscription(formData: FormData, env: Env): Promise<Response> {
	const language = (formData.get('language') as string) || 'en';
	const audioFile = formData.get('audioFile') as File | null;

	if (!audioFile) {
		return new Response(JSON.stringify({ error: 'No audio file provided' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	// Convert file to base64
	const arrayBuffer = await audioFile.arrayBuffer();
	const buffer = new Uint8Array(arrayBuffer);
	const audioBase64 = bufferToBase64(buffer);

	return await transcribeAudio(audioBase64, language, env);
}

async function transcribeAudio(audioBase64: string, language: string, env: Env): Promise<Response> {
	try {
		// Call Whisper API with the base64 encoded audio
		const transcription = (await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
			audio: audioBase64,
			task: 'transcribe',
			language: language,
		})) as WhisperResponse;

		// Return the raw response without formatting
		return new Response(JSON.stringify(transcription), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		throw error;
	}
}

// Helper function to convert Uint8Array to base64 using Node.js Buffer
function bufferToBase64(buffer: Uint8Array): string {
	return Buffer.from(buffer).toString('base64');
}
