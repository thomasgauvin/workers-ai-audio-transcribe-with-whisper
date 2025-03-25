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

interface FormattedResponse {
	text: string;
	segments: {
		id: number;
		text: string;
		start: number;
		end: number;
		words?: {
			word: string;
			start: number;
			end: number;
		}[];
	}[];
	language: string;
}

interface Env {
	AI: any; // The AI binding
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		console.log(`[REQUEST] ${request.method} ${new URL(request.url).pathname}`);
		console.log(`[HEADERS] ${JSON.stringify(Object.fromEntries(request.headers))}`);

		// Handle CORS
		if (request.method === 'OPTIONS') {
			console.log('[CORS] Handling preflight request');
			return handleCors();
		}

		try {
			const url = new URL(request.url);
			console.log(`[PATH] Processing request path: ${url.pathname}`);

			// Check if it's a transcription request
			if (request.method === 'POST' && url.pathname === '/transcribe') {
				console.log('[ROUTE] Handling transcription request');
				const response = await handleTranscription(request, env);
				console.log(`[TRANSCRIPTION] Completed with status: ${response.status}`);
				return response;
			}

			// Default response for unknown routes
			console.warn(`[404] Unknown route: ${url.pathname}`);
			return new Response('Not found', { status: 404 });
		} catch (error) {
			console.error('[ERROR] Error processing request:', error);
			console.error(`[STACK] ${(error as Error).stack || 'No stack trace available'}`);
			return new Response(JSON.stringify({ error: (error as Error).message }), {
				status: 500,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			});
		}
	},
} satisfies ExportedHandler<Env>;

async function handleTranscription(request: Request, env: Env): Promise<Response> {
	console.log('[TRANSCRIBE] Starting transcription process');

	// Validate content type
	const contentType = request.headers.get('Content-Type') || '';
	console.log(`[TRANSCRIBE] Content-Type: ${contentType}`);

	if (!contentType.includes('multipart/form-data')) {
		console.warn('[TRANSCRIBE] Invalid Content-Type, expected multipart/form-data');
		return new Response(JSON.stringify({ error: 'Content-Type must be multipart/form-data' }), { status: 400, headers: corsHeaders() });
	}

	// Get the form data
	console.log('[TRANSCRIBE] Parsing form data');
	const formData = await request.formData();
	const audioBase64 = formData.get('audioBase64') as string | null;
	const language = (formData.get('language') as string) || 'en'; // Default to English

	console.log(`[TRANSCRIBE] Form data parsed - language: ${language}, audioBase64: ${audioBase64 ? 'present' : 'missing'}`);

	if (!audioBase64) {
		console.warn('[TRANSCRIBE] No audio data provided in request');
		return new Response(JSON.stringify({ error: 'No audio data provided' }), {
			status: 400,
			headers: corsHeaders(),
		});
	}

	// Transcribe with Whisper using the @cf/openai/whisper-large-v3-turbo model
	console.log('[AI] Calling Whisper API for transcription');
	try {
		// Use the base64 audio directly from the client
		console.log(`[AI] Using base64 audio data received from client`);

		// Call Whisper API with the base64 encoded audio
		const transcription = (await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
			audio: audioBase64,
			// Optional parameters as needed:
			task: 'transcribe',
			language: language,
			vad_filter: 'false',
		})) as WhisperResponse;

		console.log(
			`[AI] Transcription successful - length: ${transcription.text.length} chars, segments: ${transcription.segments?.length || 0}`
		);

		// Format response
		console.log('[TRANSCRIBE] Formatting response');
		const formattedResponse = formatWhisperResponse(transcription);
		console.log(`[TRANSCRIBE] Formatted response - segments: ${formattedResponse.segments.length}`);

		return new Response(JSON.stringify(formattedResponse), {
			headers: corsHeaders('application/json'),
		});
	} catch (error) {
		console.error('[AI] Error during transcription:', error);
		console.error(`[AI] Error details: ${(error as Error).message}`);
		throw error; // Re-throw to be caught by the main handler
	}
}

// Format Whisper response to a more usable format
function formatWhisperResponse(whisperResponse: WhisperResponse): FormattedResponse {
	console.log('[FORMAT] Formatting Whisper API response');
	const segments = whisperResponse.segments || [];
	console.log(`[FORMAT] Processing ${segments.length} segments`);

	const result = {
		text: whisperResponse.text,
		segments: segments.map((segment, index) => ({
			id: index,
			text: segment.text,
			start: segment.start,
			end: segment.end,
			words: segment.words || [], // Include word-level data
		})),
		vtt: whisperResponse.vtt,
		language: whisperResponse.transcription_info?.language || 'unknown',
	};

	console.log(`[FORMAT] Formatting complete - total text length: ${result.text.length}`);
	return result;
}

// Helper for CORS
function handleCors(): Response {
	console.log('[CORS] Generating CORS headers for preflight response');
	return new Response(null, {
		headers: corsHeaders(),
	});
}

function corsHeaders(contentType: string = ''): Record<string, string> {
	console.log(`[CORS] Creating CORS headers${contentType ? ' with content-type: ' + contentType : ''}`);
	const headers: Record<string, string> = {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	};

	if (contentType) {
		headers['Content-Type'] = contentType;
	}

	console.log(`[CORS] Headers generated: ${JSON.stringify(headers)}`);
	return headers;
}
