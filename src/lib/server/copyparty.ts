import { env } from '$env/dynamic/private';

type FetchLike = typeof fetch;

type CopypartyRawItem = {
	name?: unknown;
	href?: unknown;
	sz?: unknown;
	dt?: unknown;
	ts?: unknown;
	ext?: unknown;
	tags?: unknown;
};

type CopypartyRawListing = {
	dirs?: unknown;
	files?: unknown;
	acct?: unknown;
	srvinf?: unknown;
};

export type InventoryEntry = {
	kind: 'dir' | 'file';
	name: string;
	href: string;
	size: number;
	modified: string;
	modifiedTs: number;
	extension: string | null;
	tags: Record<string, string>;
	nextPath: string | null;
};

export type InventoryData = {
	configured: boolean;
	currentPath: string;
	parentPath: string | null;
	rootPath: string;
	uploadUrl: string;
	directories: InventoryEntry[];
	files: InventoryEntry[];
	account: string;
	serverInfo: string;
	error: string | null;
	totalBytes: number;
};

type CopypartyConnection = {
	baseUrl: string;
	rootPath: string;
	password: string;
	cookie: string;
	timeoutMs: number;
};

const DEFAULT_TIMEOUT_MS = 8_000;
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const modifiedFormatter = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: '2-digit',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit'
});

export async function getInventoryData({
	fetch,
	requestedPath,
	requestOrigin
}: {
	fetch: FetchLike;
	requestedPath: string | null;
	requestOrigin?: string;
}): Promise<InventoryData> {
	const currentPath = normalizePath(requestedPath ?? '/');
	const parentPath = getParentPath(currentPath);
	const rootPath = normalizePath(env.COPYPARTY_ROOT_PATH ?? '/');
	const baseUrl = env.COPYPARTY_BASE_URL?.trim();

	if (!baseUrl) {
		return {
			configured: false,
			currentPath,
			parentPath,
			rootPath,
			uploadUrl: '',
			directories: [],
			files: [],
			account: '',
			serverInfo: '',
			error: null,
			totalBytes: 0
		};
	}

	const upstreamPath = joinPaths(rootPath, currentPath);
	const password = env.COPYPARTY_PASSWORD?.trim() ?? '';
	const publicBaseUrl = resolvePublicBaseUrl(baseUrl, requestOrigin);

	try {
		const url = buildListingUrl(baseUrl, upstreamPath);
		const uploadUrl = buildUploadUrl(publicBaseUrl, upstreamPath, password);
		const cookie = env.COPYPARTY_COOKIE?.trim();
		const headers = new Headers({ Accept: 'application/json' });

		if (cookie) {
			headers.set('Cookie', cookie);
		}

		const timeoutMs = parsePositiveNumber(env.COPYPARTY_TIMEOUT_MS) ?? DEFAULT_TIMEOUT_MS;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		let response: Response;
		try {
			response = await fetch(url, {
				method: 'GET',
				headers,
				signal: controller.signal
			});
		} finally {
			clearTimeout(timeout);
		}

		if (!response.ok) {
			throw new Error(`Copyparty responded with HTTP ${response.status}.`);
		}

		let payload: CopypartyRawListing;
		try {
			payload = (await response.json()) as CopypartyRawListing;
		} catch {
			throw new Error('Copyparty did not return JSON. Verify `?ls` access and credentials.');
		}
		const rawDirs = asItemArray(payload.dirs);
		const rawFiles = asItemArray(payload.files);

		const directories = rawDirs
			.map((item) => mapItem(item, 'dir', { currentPath, rootPath, baseUrl: publicBaseUrl, password }))
			.sort((a, b) => collator.compare(a.name, b.name));

		const files = rawFiles
			.map((item) => mapItem(item, 'file', { currentPath, rootPath, baseUrl: publicBaseUrl, password }))
			.sort((a, b) => collator.compare(a.name, b.name));

		const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

		return {
			configured: true,
			currentPath,
			parentPath,
			rootPath,
			uploadUrl,
			directories,
			files,
			account: typeof payload.acct === 'string' ? payload.acct : '',
			serverInfo: typeof payload.srvinf === 'string' ? payload.srvinf : '',
			error: null,
			totalBytes
		};
	} catch (error) {
		return {
			configured: true,
			currentPath,
			parentPath,
			rootPath,
			uploadUrl: buildUploadUrl(publicBaseUrl, upstreamPath, password),
			directories: [],
			files: [],
			account: '',
			serverInfo: '',
			error: resolveErrorMessage(error),
			totalBytes: 0
		};
	}
}

function resolvePublicBaseUrl(baseUrl: string, requestOrigin?: string): string {
	const explicitPublicBase = env.COPYPARTY_PUBLIC_BASE_URL?.trim();
	if (explicitPublicBase) {
		return explicitPublicBase;
	}

	if (!requestOrigin) {
		return baseUrl;
	}

	try {
		const internal = new URL(baseUrl);
		if (!isLoopbackHost(internal.hostname)) {
			return baseUrl;
		}

		const incoming = new URL(requestOrigin);
		internal.hostname = incoming.hostname;
		return internal.toString();
	} catch {
		return baseUrl;
	}
}

function isLoopbackHost(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	return (
		normalized === 'localhost' ||
		normalized === '127.0.0.1' ||
		normalized === '::1' ||
		normalized === '[::1]' ||
		normalized.endsWith('.localhost')
	);
}

export async function deleteInventoryPath({
	fetch,
	targetPath,
	requestCookie
}: {
	fetch: FetchLike;
	targetPath: string;
	requestCookie?: string;
}): Promise<void> {
	const connection = getCopypartyConnection();
	const normalizedPath = normalizePath(targetPath);
	if (normalizedPath === '/') {
		throw new Error('Cannot delete root path.');
	}

	const url = buildScopedUrl(connection, normalizedPath);
	const response = await fetchCopyparty(connection, fetch, url, {
		method: 'DELETE'
	}, requestCookie);

	if (!response.ok) {
		throw new Error(await buildHttpErrorMessage('Delete failed', response));
	}
}

export async function renameInventoryPath({
	fetch,
	targetPath,
	newName,
	requestCookie
}: {
	fetch: FetchLike;
	targetPath: string;
	newName: string;
	requestCookie?: string;
}): Promise<void> {
	const connection = getCopypartyConnection();
	const normalizedPath = normalizePath(targetPath);
	if (normalizedPath === '/') {
		throw new Error('Cannot rename root path.');
	}

	const safeName = sanitizeLeafName(newName, 'New name');
	const parentPath = getParentPath(normalizedPath);
	if (parentPath === null) {
		throw new Error('Cannot rename root path.');
	}
	const destinationPath = joinPaths(parentPath, safeName);
	if (destinationPath === normalizedPath) {
		return;
	}

	await moveScopedPath({
		connection,
		fetch,
		sourcePath: normalizedPath,
		destinationPath,
		requestCookie,
		errorPrefix: 'Rename failed'
	});
}

export async function moveInventoryPath({
	fetch,
	targetPath,
	destinationPath,
	requestCookie
}: {
	fetch: FetchLike;
	targetPath: string;
	destinationPath: string;
	requestCookie?: string;
}): Promise<void> {
	const connection = getCopypartyConnection();
	const normalizedPath = normalizePath(targetPath);
	if (normalizedPath === '/') {
		throw new Error('Cannot move root path.');
	}

	const sourceName = getPathLeafName(normalizedPath);
	if (!sourceName) {
		throw new Error('Invalid source path.');
	}

	const normalizedDestinationDirectory = normalizePath(destinationPath);
	const resolvedDestinationPath = joinPaths(normalizedDestinationDirectory, sourceName);
	if (resolvedDestinationPath === normalizedPath) {
		return;
	}

	await moveScopedPath({
		connection,
		fetch,
		sourcePath: normalizedPath,
		destinationPath: resolvedDestinationPath,
		requestCookie,
		errorPrefix: 'Move failed'
	});
}

export async function createInventoryDirectory({
	fetch,
	parentPath,
	folderName,
	requestCookie
}: {
	fetch: FetchLike;
	parentPath: string;
	folderName: string;
	requestCookie?: string;
}): Promise<void> {
	const connection = getCopypartyConnection();
	const safeFolderName = sanitizeLeafName(folderName, 'Folder name');
	const scopedPath = joinPaths(normalizePath(parentPath), safeFolderName);
	const url = buildScopedUrl(connection, scopedPath);
	url.pathname = ensureTrailingSlash(url.pathname);

	const response = await fetchCopyparty(connection, fetch, url, {
		method: 'MKCOL'
	}, requestCookie);

	if (response.ok) {
		return;
	}

	if (response.status === 405 || response.status === 409) {
		throw new Error('Folder already exists.');
	}
	throw new Error(await buildHttpErrorMessage('Create folder failed', response));
}

function buildListingUrl(baseUrl: string, virtualPath: string): URL {
	const url = new URL(baseUrl);
	url.pathname = joinPaths(url.pathname, virtualPath);

	const password = env.COPYPARTY_PASSWORD?.trim();
	if (password) {
		url.searchParams.set('pw', password);
	}

	url.searchParams.set('ls', '');
	return url;
}

function buildUploadUrl(baseUrl: string, virtualPath: string, password: string): string {
	const url = new URL(baseUrl);
	url.pathname = joinPaths(url.pathname, virtualPath);

	if (password) {
		url.searchParams.set('pw', password);
	}

	return url.toString();
}

function getCopypartyConnection(): CopypartyConnection {
	const baseUrl = env.COPYPARTY_BASE_URL?.trim();
	if (!baseUrl) {
		throw new Error('Copyparty is not configured.');
	}

	return {
		baseUrl,
		rootPath: normalizePath(env.COPYPARTY_ROOT_PATH ?? '/'),
		password: env.COPYPARTY_PASSWORD?.trim() ?? '',
		cookie: env.COPYPARTY_COOKIE?.trim() ?? '',
		timeoutMs: parsePositiveNumber(env.COPYPARTY_TIMEOUT_MS) ?? DEFAULT_TIMEOUT_MS
	};
}

function buildScopedUrl(connection: CopypartyConnection, targetPath: string): URL {
	const upstreamPath = joinPaths(connection.rootPath, normalizePath(targetPath));
	const url = new URL(connection.baseUrl);
	url.pathname = joinPaths(url.pathname, upstreamPath);

	if (connection.password) {
		url.searchParams.set('pw', connection.password);
	}

	return url;
}

async function fetchCopyparty(
	connection: CopypartyConnection,
	fetch: FetchLike,
	url: URL,
	init: RequestInit,
	requestCookie?: string
): Promise<Response> {
	const headers = new Headers(init.headers);
	const targetOrigin = `${url.protocol}//${url.host}`;
	// Server-side requests can inherit browser Origin/Referer via event.fetch.
	// Force these to the Copyparty origin so CSRF/CORS checks accept WebDAV actions.
	headers.delete('origin');
	headers.delete('referer');
	headers.set('Origin', targetOrigin);
	headers.set('Referer', `${targetOrigin}/`);

	const cookieHeader = [connection.cookie, requestCookie ?? ''].filter(Boolean).join('; ');
	if (cookieHeader) {
		headers.set('Cookie', cookieHeader);
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), connection.timeoutMs);

	try {
		return await fetch(url, {
			...init,
			headers,
			signal: controller.signal
		});
	} finally {
		clearTimeout(timeout);
	}
}

async function moveScopedPath({
	connection,
	fetch,
	sourcePath,
	destinationPath,
	requestCookie,
	errorPrefix
}: {
	connection: CopypartyConnection;
	fetch: FetchLike;
	sourcePath: string;
	destinationPath: string;
	requestCookie?: string;
	errorPrefix: string;
}): Promise<void> {
	const sourceUrl = buildScopedUrl(connection, sourcePath);
	const destinationUrl = buildScopedUrl(connection, destinationPath);
	// Copyparty treats WebDAV Destination as a path; query/hash fragments become part of the
	// destination filename on Windows and can trigger HTTP 422.
	destinationUrl.search = '';
	destinationUrl.hash = '';
	const response = await fetchCopyparty(
		connection,
		fetch,
		sourceUrl,
		{
			method: 'MOVE',
			headers: {
				Destination: destinationUrl.toString(),
				Overwrite: 'T'
			}
		},
		requestCookie
	);

	if (!response.ok) {
		throw new Error(await buildHttpErrorMessage(errorPrefix, response));
	}
}

function sanitizeLeafName(value: string, label: string): string {
	const cleaned = value.trim();
	if (!cleaned) {
		throw new Error(`${label} is required.`);
	}
	if (cleaned === '.' || cleaned === '..') {
		throw new Error(`${label} is invalid.`);
	}
	if (cleaned.includes('/') || cleaned.includes('\\')) {
		throw new Error(`${label} cannot include slashes.`);
	}
	return cleaned;
}

function ensureTrailingSlash(value: string): string {
	return value.endsWith('/') ? value : `${value}/`;
}

async function buildHttpErrorMessage(prefix: string, response: Response): Promise<string> {
	let details = '';
	try {
		details = (await response.text()).replace(/\s+/g, ' ').trim();
	} catch {
		details = '';
	}

	if (!details) {
		return `${prefix}: HTTP ${response.status}.`;
	}

	if (response.status === 401 && /move-access/i.test(details)) {
		return `${prefix}: HTTP 401. Copyparty denied move-access for this path. Grant move permission in Copyparty or set COPYPARTY_PASSWORD/COPYPARTY_COOKIE to credentials with move rights.`;
	}

	if (response.status === 422 && /unprocessable entity/i.test(details)) {
		return `${prefix}: HTTP 422. Copyparty rejected the path as invalid. For WebDAV MOVE/COPY, ensure Destination does not include query parameters.`;
	}

	return `${prefix}: HTTP ${response.status} (${details.slice(0, 220)}).`;
}

function asItemArray(value: unknown): CopypartyRawItem[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter(
		(entry): entry is CopypartyRawItem => Boolean(entry) && typeof entry === 'object'
	);
}

function mapItem(
	item: CopypartyRawItem,
	kind: 'dir' | 'file',
	context: {
		currentPath: string;
		rootPath: string;
		baseUrl: string;
		password: string;
	}
): InventoryEntry {
	const rawName = cleanItemName(asString(item.name));
	const rawHref = asString(item.href);
	const inferredName = cleanItemName(extractNameFromHref(rawHref));
	const safeName = rawName || inferredName || 'unnamed';
	const modifiedTs = asNumber(item.ts);
	const resolvedHref = buildItemHref({
		baseUrl: context.baseUrl,
		rootPath: context.rootPath,
		currentPath: context.currentPath,
		rawHref,
		fallbackName: safeName,
		kind,
		password: context.password
	});

	return {
		kind,
		name: safeName,
		href: resolvedHref,
		size: asNumber(item.sz),
		modified: asString(item.dt) || formatModifiedTimestamp(modifiedTs),
		modifiedTs,
		extension: resolveExtension(item.ext, safeName),
		tags: toTagRecord(item.tags),
		nextPath: kind === 'dir' ? joinPaths(context.currentPath, safeName) : null
	};
}

function cleanItemName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) {
		return '';
	}

	return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function extractNameFromHref(rawHref: string): string {
	if (!rawHref) {
		return '';
	}

	const withoutHash = rawHref.split('#')[0] ?? '';
	const withoutQuery = withoutHash.split('?')[0] ?? '';
	const withoutTrailingSlash = withoutQuery.replace(/\/+$/, '');
	const segment = withoutTrailingSlash.split('/').filter(Boolean).pop() ?? '';

	if (!segment) {
		return '';
	}

	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

function buildItemHref({
	baseUrl,
	rootPath,
	currentPath,
	rawHref,
	fallbackName,
	kind,
	password
}: {
	baseUrl: string;
	rootPath: string;
	currentPath: string;
	rawHref: string;
	fallbackName: string;
	kind: 'dir' | 'file';
	password: string;
}): string {
	const base = new URL(baseUrl);
	const currentDirPath = joinPaths(base.pathname, joinPaths(rootPath, currentPath));
	base.pathname = currentDirPath.endsWith('/') ? currentDirPath : `${currentDirPath}/`;

	let hrefValue = rawHref.trim();
	if (!hrefValue) {
		const encoded = encodeURIComponent(fallbackName);
		hrefValue = kind === 'dir' ? `${encoded}/` : encoded;
	}

	try {
		const resolved = new URL(hrefValue, base);
		if (password && !resolved.searchParams.has('pw')) {
			resolved.searchParams.set('pw', password);
		}
		return resolved.toString();
	} catch {
		return hrefValue;
	}
}

function resolveExtension(rawExtension: unknown, name: string): string | null {
	const extension = asString(rawExtension).toLowerCase().trim();

	if (extension && extension !== '---' && extension !== '%') {
		return extension;
	}

	const dotIndex = name.lastIndexOf('.');
	if (dotIndex <= 0 || dotIndex >= name.length - 1) {
		return null;
	}

	return name.slice(dotIndex + 1).toLowerCase();
}

function toTagRecord(value: unknown): Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}

	const record: Record<string, string> = {};
	for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
		if (typeof entry === 'string') {
			record[key] = entry;
		}
	}

	return record;
}

function getParentPath(path: string): string | null {
	if (path === '/') {
		return null;
	}

	const segments = path.split('/').filter(Boolean);
	segments.pop();
	return segments.length ? `/${segments.join('/')}` : '/';
}

function getPathLeafName(path: string): string | null {
	const segments = path.split('/').filter(Boolean);
	return segments.length > 0 ? segments[segments.length - 1] : null;
}

function joinPaths(base: string, child: string): string {
	return normalizePath(`${base}/${child}`);
}

function normalizePath(path: string): string {
	const segments: string[] = [];
	for (const piece of path.replace(/\\/g, '/').split('/')) {
		const segment = piece.trim();
		if (!segment || segment === '.') {
			continue;
		}
		if (segment === '..') {
			segments.pop();
			continue;
		}
		segments.push(segment);
	}
	return segments.length ? `/${segments.join('/')}` : '/';
}

function parsePositiveNumber(value: string | undefined): number | null {
	if (!value) {
		return null;
	}
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function asString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function resolveErrorMessage(error: unknown): string {
	if (error instanceof DOMException && error.name === 'AbortError') {
		return 'Copyparty request timed out.';
	}

	if (error instanceof Error && error.message) {
		return error.message;
	}

	return 'Unable to load listing from Copyparty.';
}

function formatModifiedTimestamp(value: number): string {
	if (!Number.isFinite(value) || value <= 0) {
		return '';
	}

	const epochMs = value > 10_000_000_000 ? value : value * 1000;
	try {
		return modifiedFormatter.format(new Date(epochMs));
	} catch {
		return '';
	}
}
