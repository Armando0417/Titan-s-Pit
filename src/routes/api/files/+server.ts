import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import {
	createInventoryDirectory,
	deleteInventoryPath,
	moveInventoryPath,
	renameInventoryPath
} from '$lib/server/copyparty';

type ActionPayload = {
	action?: unknown;
	path?: unknown;
	destinationPath?: unknown;
	newName?: unknown;
	name?: unknown;
};

export const POST: RequestHandler = async ({ request, fetch }) => {
	let payload: ActionPayload;
	try {
		payload = (await request.json()) as ActionPayload;
	} catch {
		return json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
	}

	const action = asString(payload.action);
	const requestCookie = shouldForwardRequestCookies(request.url, env.COPYPARTY_BASE_URL?.trim())
		? request.headers.get('cookie') ?? ''
		: '';
	try {
		if (action === 'delete') {
			const path = asString(payload.path);
			if (!path) {
				return json({ ok: false, error: 'Path is required.' }, { status: 400 });
			}

			await deleteInventoryPath({
				fetch,
				targetPath: path,
				requestCookie
			});
			return json({ ok: true });
		}

		if (action === 'rename') {
			const path = asString(payload.path);
			const newName = asString(payload.newName);
			if (!path) {
				return json({ ok: false, error: 'Path is required.' }, { status: 400 });
			}
			if (!newName) {
				return json({ ok: false, error: 'New name is required.' }, { status: 400 });
			}

			await renameInventoryPath({
				fetch,
				targetPath: path,
				newName,
				requestCookie
			});
			return json({ ok: true });
		}

		if (action === 'mkdir') {
			const parentPath = asString(payload.path);
			const folderName = asString(payload.name);
			if (!parentPath) {
				return json({ ok: false, error: 'Parent path is required.' }, { status: 400 });
			}
			if (!folderName) {
				return json({ ok: false, error: 'Folder name is required.' }, { status: 400 });
			}

			await createInventoryDirectory({
				fetch,
				parentPath,
				folderName,
				requestCookie
			});
			return json({ ok: true });
		}

		if (action === 'move') {
			const path = asString(payload.path);
			const destinationPath = asString(payload.destinationPath);
			if (!path) {
				return json({ ok: false, error: 'Path is required.' }, { status: 400 });
			}
			if (!destinationPath) {
				return json({ ok: false, error: 'Destination path is required.' }, { status: 400 });
			}

			await moveInventoryPath({
				fetch,
				targetPath: path,
				destinationPath,
				requestCookie
			});
			return json({ ok: true });
		}

		return json({ ok: false, error: 'Unknown action.' }, { status: 400 });
	} catch (error) {
		const message = resolveErrorMessage(error);
		const status = isLikelyClientError(message) ? 400 : 502;
		return json({ ok: false, error: message }, { status });
	}
};

function asString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function resolveErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return 'Unexpected file operation failure.';
}

function isLikelyClientError(message: string): boolean {
	const lower = message.toLowerCase();
	return (
		lower.includes('required') ||
		lower.includes('invalid') ||
		lower.includes('cannot') ||
		lower.includes('exists') ||
		lower.includes('not configured') ||
		lower.includes('denied') ||
		lower.includes('http 401') ||
		lower.includes('http 403')
	);
}

function shouldForwardRequestCookies(requestUrl: string, copypartyBaseUrl: string | undefined): boolean {
	if (!copypartyBaseUrl) {
		return false;
	}

	try {
		const requestOrigin = new URL(requestUrl);
		const copypartyOrigin = new URL(copypartyBaseUrl);
		return (
			requestOrigin.protocol === copypartyOrigin.protocol &&
			requestOrigin.hostname === copypartyOrigin.hostname
		);
	} catch {
		return false;
	}
}
