<script lang="ts">
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import FileViewerModal from '$lib/components/FileViewerModal.svelte';
	import FileActionDialog from '$lib/components/FileActionDialog.svelte';
	import UploadConflictDialog from '$lib/components/UploadConflictDialog.svelte';
	import clickItem2Sfx from '$lib/assets/sfx/click_item_2.m4a';
	import confirmClickSfx from '$lib/assets/sfx/confirm_click_sfx.m4a';
	import dialogCloseSfx from '$lib/assets/sfx/dialog_close_sfx.m4a';
	import dialogOpenSfx from '$lib/assets/sfx/dialog_open_sfx.m4a';
	import hoverItemSfx from '$lib/assets/sfx/hover_item.m4a';
	import menuItemSfx from '$lib/assets/sfx/menu_item.m4a';

	export let data: PageData;

	type InventoryFile = {
		name: string;
		extension: string | null;
		size: number;
		modified: string;
		modifiedTs: number;
		href: string;
	};

	type ActiveViewerFile = {
		name: string;
		type: string;
		sizeBytes: number;
		modified: string;
		href: string;
	};

	type SortKey = 'name' | 'type' | 'size' | 'modified';
	type SortDirection = 'asc' | 'desc';
	type SfxKey = 'hover' | 'menuItem' | 'folderClick' | 'fileClick' | 'dialogOpen' | 'dialogClose';
	type SidebarTab = 'inventions' | 'forge';
	type TransferStatus = 'queued' | 'uploading' | 'complete' | 'error';
	type ConflictStrategy = 'rename' | 'replace' | 'skip';
	type TransferItem = {
		id: string;
		file: File;
		sourceName: string;
		targetName: string;
		targetPath: string;
		destinationPath: string;
		uploadUrl: string;
		name: string;
		size: number;
		loaded: number;
		progress: number;
		status: TransferStatus;
		replaceExisting: boolean;
		error?: string;
		xhr?: XMLHttpRequest;
	};
	type UploadConflictItem = {
		name: string;
		size: number;
	};
	type UploadCandidate = {
		file: File;
		relativePath: string;
	};
	type FileSystemEntryLike = {
		isFile: boolean;
		isDirectory: boolean;
		name: string;
	};
	type FileSystemFileEntryLike = FileSystemEntryLike & {
		isFile: true;
		file: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
	};
	type FileSystemDirectoryReaderLike = {
		readEntries: (
			success: (entries: FileSystemEntryLike[]) => void,
			error?: (error: DOMException) => void
		) => void;
	};
	type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
		isDirectory: true;
		createReader: () => FileSystemDirectoryReaderLike;
	};
	type FileActionResponse = {
		ok: boolean;
		error?: string;
	};
	type FileBadgeTone =
		| 'tone-image'
		| 'tone-video'
		| 'tone-audio'
		| 'tone-text'
		| 'tone-code'
		| 'tone-archive'
		| 'tone-other';

	const modifiedFormatter = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
	const sortCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

	const IMAGE_TYPES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp']);
	const VIDEO_TYPES = new Set(['mp4', 'mkv', 'webm', 'mov', 'm4v', 'avi', 'ogv', 'ogg']);
	const AUDIO_TYPES = new Set(['mp3', 'wav', 'm4a', 'flac', 'aac', 'opus']);
	const ARCHIVE_TYPES = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']);
	const CODE_TYPES = new Set([
		'ts',
		'js',
		'svelte',
		'css',
		'py',
		'go',
		'rs',
		'java',
		'cpp',
		'c',
		'sh'
	]);
	const TEXT_TYPES = new Set(['txt', 'md', 'json', 'csv', 'html', 'xml', 'yaml', 'yml', 'log']);
	const SFX_SOURCES: Record<SfxKey, string> = {
		hover: hoverItemSfx,
		menuItem: menuItemSfx,
		folderClick: confirmClickSfx,
		fileClick: clickItem2Sfx,
		dialogOpen: dialogOpenSfx,
		dialogClose: dialogCloseSfx
	};
	const HOVER_SFX_POOL_SIZE = 6;
	const HOVER_SFX_MIN_INTERVAL_MS = 14;
	const MAX_CONCURRENT_UPLOADS = 3;
	const MOBILE_CONCURRENT_UPLOADS = 1;
	const UPLOAD_ENQUEUE_BATCH_SIZE = 120;
	const MAX_VISIBLE_TRANSFER_ITEMS = 180;
	const MAX_FINISHED_TRANSFER_ITEMS = 260;
	const TRANSFER_UI_REFRESH_INTERVAL_MS = 100;
	const INVENTORY_DRAG_MIME = 'application/x-titanspit-inventory-paths';

	let viewerOpen = false;
	let activeFile: ActiveViewerFile | null = null;
	let previewSelectedFileName: string | null = null;
	let activeFileIndex = -1;
	let canGoToPreviousFile = false;
	let canGoToNextFile = false;
	let sortKey: SortKey = data.sort.key;
	let sortDirection: SortDirection = data.sort.direction;
	let sortedFiles: InventoryFile[] = [];
	let filteredSortedFiles: InventoryFile[] = [];
	let inventorySearchQuery = '';
	let normalizedInventorySearchQuery = '';
	let filteredDirectories = data.inventory.directories;
	let fileViewMode: 'list' | 'grid' = 'list';
	let foldersPanelExpanded = false;
	let activeSidebarTab: SidebarTab = data.initialTab;
	let sidebarTabSyncKey = `${data.inventory.currentPath}|${data.initialTab}`;
	const sfxCache: Partial<Record<SfxKey, HTMLAudioElement>> = {};
	const hoverSfxPool: HTMLAudioElement[] = [];
	let hoverSfxPoolCursor = 0;
	let lastHoverSfxTs = 0;
	let forgeFileInput: HTMLInputElement | null = null;
	let forgeFolderInput: HTMLInputElement | null = null;
	let forgeDragDepth = 0;
	let forgeDragActive = false;
	let forgeDropError = '';
	let uploadDrawerOpen = true;
	let transferItems: TransferItem[] = [];
	let transferItemsRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	let transferItemsRefreshPending = false;
	let lastTransferItemsRefreshTs = 0;
	const uploadQueue: TransferItem[] = [];
	let activeUploads = 0;
	let uploadConcurrencyLimit = MAX_CONCURRENT_UPLOADS;
	let needsInventoryRefresh = false;
	let forgeUploadsEnabled = false;
	let forgePreparing = false;
	let forgePreparationLabel = '';
	let forgePreparationProgress = 0;
	let activeTransferCount = 0;
	let visibleTransferItems: TransferItem[] = [];
	let hiddenTransferItemCount = 0;
	let fileActionOpen = false;
	let fileActionFile: InventoryFile | null = null;
	let fileActionBusy = false;
	let fileActionError = '';
	let newFolderName = '';
	let newFolderBusy = false;
	let newFolderError = '';
	let uploadConflictOpen = false;
	let uploadConflictItems: UploadConflictItem[] = [];
	let pendingUploadFiles: UploadCandidate[] = [];
	let pendingUploadDestinationPath = '';
	let selectedFileNames = new Set<string>();
	let selectedFileCount = 0;
	let allFilesSelected = false;
	let activeFolderDropPath: string | null = null;
	let draggingInventoryPaths: string[] = [];
	let moveFilesBusy = false;
	let deleteFilesBusy = false;
	let moveFilesError = '';
	let folderDeleteBusyPath: string | null = null;
	let folderDeleteError = '';
	const ensuredUploadPaths = new Set<string>(['/']);
	const ensureUploadPathTasks = new Map<string, Promise<FileActionResponse>>();

	function isLikelyMobileClient(): boolean {
		if (!browser) {
			return false;
		}

		const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
		const ua = navigator.userAgent || '';
		const isMobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
		return hasCoarsePointer || isMobileUa;
	}

	if (isLikelyMobileClient()) {
		uploadConcurrencyLimit = MOBILE_CONCURRENT_UPLOADS;
	}

	function isTransferActive(status: TransferStatus): boolean {
		return status === 'queued' || status === 'uploading';
	}

	function setForgePreparationState(label: string, progress = 0) {
		forgePreparing = true;
		forgePreparationLabel = label;
		forgePreparationProgress = Math.max(0, Math.min(100, Math.round(progress)));
	}

	function clearForgePreparationState() {
		forgePreparing = false;
		forgePreparationLabel = '';
		forgePreparationProgress = 0;
	}

	function pruneFinishedTransferHistory() {
		let finishedCount = 0;
		const nextReversed: TransferItem[] = [];
		for (let index = transferItems.length - 1; index >= 0; index -= 1) {
			const item = transferItems[index];
			if (isTransferActive(item.status)) {
				nextReversed.push(item);
				continue;
			}

			if (finishedCount >= MAX_FINISHED_TRANSFER_ITEMS) {
				continue;
			}
			finishedCount += 1;
			nextReversed.push(item);
		}

		nextReversed.reverse();
		const next = nextReversed;
		if (next.length !== transferItems.length) {
			transferItems = next;
		}
	}

	function createUploadPrepLabel(verb: string, processed: number, total: number): string {
		const safeTotal = Math.max(0, total);
		return `${verb} ${Math.min(processed, safeTotal)} / ${safeTotal} files`;
	}

	async function yieldToMainThread() {
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});
	}

	function flushTransferItemsRefresh() {
		transferItemsRefreshPending = false;
		transferItemsRefreshTimer = null;
		lastTransferItemsRefreshTs = Date.now();
		// Reassign to trigger Svelte reactivity for nested TransferItem mutations.
		transferItems = transferItems;
	}

	function touchTransferItems(immediate = false) {
		if (immediate) {
			if (transferItemsRefreshTimer !== null) {
				clearTimeout(transferItemsRefreshTimer);
				transferItemsRefreshTimer = null;
			}
			flushTransferItemsRefresh();
			return;
		}

		if (transferItemsRefreshPending) {
			return;
		}

		const now = Date.now();
		const elapsed = now - lastTransferItemsRefreshTs;
		const delay = Math.max(0, TRANSFER_UI_REFRESH_INTERVAL_MS - elapsed);
		transferItemsRefreshPending = true;
		transferItemsRefreshTimer = setTimeout(() => {
			flushTransferItemsRefresh();
		}, delay);
	}

	function getSfxAudio(key: SfxKey): HTMLAudioElement | null {
		if (!browser) {
			return null;
		}

		const existing = sfxCache[key];
		if (existing) {
			return existing;
		}

		const audio = new Audio(SFX_SOURCES[key]);
		audio.preload = 'auto';
		sfxCache[key] = audio;
		return audio;
	}

	function playSfx(key: SfxKey) {
		const audio = getSfxAudio(key);
		if (!audio) {
			return;
		}

		audio.currentTime = 0;
		const promise = audio.play();
		if (promise) {
			void promise.catch(() => {
				// Ignore autoplay/interrupt errors for UX sounds.
			});
		}
	}

	function getNextHoverSfxAudio(): HTMLAudioElement | null {
		if (!browser) {
			return null;
		}

		if (hoverSfxPool.length === 0) {
			for (let i = 0; i < HOVER_SFX_POOL_SIZE; i += 1) {
				const audio = new Audio(SFX_SOURCES.hover);
				audio.preload = 'auto';
				hoverSfxPool.push(audio);
			}
		}

		const audio = hoverSfxPool[hoverSfxPoolCursor];
		hoverSfxPoolCursor = (hoverSfxPoolCursor + 1) % hoverSfxPool.length;
		return audio ?? null;
	}

	function playHoverSfx() {
		const now = Date.now();
		if (now - lastHoverSfxTs < HOVER_SFX_MIN_INTERVAL_MS) {
			return;
		}
		lastHoverSfxTs = now;

		const audio = getNextHoverSfxAudio();
		if (!audio) {
			return;
		}

		audio.currentTime = 0;
		const promise = audio.play();
		if (promise) {
			void promise.catch(() => {
				// Ignore autoplay/interrupt errors for UX sounds.
			});
		}
	}

	function playMenuItemSfx() {
		playSfx('menuItem');
	}

	function playFolderClickSfx() {
		playSfx('folderClick');
	}

	function onFileRowClick(file: InventoryFile) {
		playSfx('fileClick');
		if (previewSelectedFileName !== file.name) {
			previewSelectedFileName = file.name;
			return;
		}
		openFileViewer(file);
	}

	function onFileRowKeydown(event: KeyboardEvent, file: InventoryFile) {
		if (event.key !== 'Enter' && event.key !== ' ') {
			return;
		}
		event.preventDefault();
		onFileRowClick(file);
	}

	function setSidebarTab(tab: SidebarTab) {
		if (activeSidebarTab === tab) {
			return;
		}

		playMenuItemSfx();
		activeSidebarTab = tab;
	}

	function toggleFoldersPanelExpanded() {
		playMenuItemSfx();
		foldersPanelExpanded = !foldersPanelExpanded;
	}

	function setFilesPanelPriority() {
		if (!foldersPanelExpanded) {
			return;
		}

		playMenuItemSfx();
		foldersPanelExpanded = false;
	}

	function joinInventoryPath(nameOrPath: string): string {
		const base = data.inventory.currentPath === '/' ? '' : data.inventory.currentPath;
		const child = nameOrPath.trim().replace(/^\/+/, '');
		if (!child) {
			return base || '/';
		}
		const combined = `${base}/${child}`.replace(/\/{2,}/g, '/');
		return combined.startsWith('/') ? combined : `/${combined}`;
	}

	function normalizeInventoryPath(path: string): string {
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

	function getParentInventoryPath(path: string): string | null {
		const normalized = normalizeInventoryPath(path);
		if (normalized === '/') {
			return null;
		}

		const segments = normalized.split('/').filter(Boolean);
		segments.pop();
		return segments.length ? `/${segments.join('/')}` : '/';
	}

	function getInventoryLeafName(path: string): string {
		const normalized = normalizeInventoryPath(path);
		const segments = normalized.split('/').filter(Boolean);
		return segments.length > 0 ? segments[segments.length - 1] : normalized;
	}

	function formatPathLabel(path: string): string {
		return path === '/' ? '/' : path;
	}

	function joinNormalizedPaths(base: string, child: string): string {
		return normalizeInventoryPath(`${base}/${child}`);
	}

	function normalizeUploadRelativePath(path: string): string {
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
		return segments.join('/');
	}

	function splitUploadRelativePath(relativePath: string): { directory: string; fileName: string } {
		const normalized = normalizeUploadRelativePath(relativePath);
		if (!normalized) {
			return { directory: '', fileName: '' };
		}

		const segments = normalized.split('/');
		const fileName = segments.pop() ?? '';
		return {
			directory: segments.join('/'),
			fileName
		};
	}

	function buildUploadCandidatesFromFiles(files: File[]): UploadCandidate[] {
		const candidates: UploadCandidate[] = [];
		for (const file of files) {
			if (!file || file.name.trim() === '') {
				continue;
			}

			const relativePath = normalizeUploadRelativePath(
				(file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
			);
			if (!relativePath) {
				continue;
			}

			candidates.push({
				file,
				relativePath
			});
		}
		return candidates;
	}

	function buildUploadCandidatesFromFileList(fileList: FileList | null): UploadCandidate[] {
		const candidates: UploadCandidate[] = [];
		if (!fileList) {
			return candidates;
		}

		for (let i = 0; i < fileList.length; i += 1) {
			const file = fileList.item(i);
			if (!file || file.name.trim() === '') {
				continue;
			}

			const relativePath = normalizeUploadRelativePath(
				(file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
			);
			if (!relativePath) {
				continue;
			}

			candidates.push({
				file,
				relativePath
			});
		}

		return candidates;
	}

	function dedupeUploadCandidates(candidates: UploadCandidate[]): UploadCandidate[] {
		const seen = new Set<string>();
		const deduped: UploadCandidate[] = [];
		for (const candidate of candidates) {
			const key = `${candidate.relativePath}::${candidate.file.size}::${candidate.file.lastModified}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			deduped.push(candidate);
		}
		return deduped;
	}

	function getEntryChildren(entry: FileSystemDirectoryEntryLike): Promise<FileSystemEntryLike[]> {
		const reader = entry.createReader();
		return new Promise((resolve) => {
			const collected: FileSystemEntryLike[] = [];
			const readNext = () => {
				reader.readEntries(
					(entries) => {
						if (!entries || entries.length === 0) {
							resolve(collected);
							return;
						}
						collected.push(...entries);
						readNext();
					},
					() => resolve(collected)
				);
			};
			readNext();
		});
	}

	function getFileFromEntry(entry: FileSystemFileEntryLike): Promise<File | null> {
		return new Promise((resolve) => {
			entry.file(
				(file) => resolve(file),
				() => resolve(null)
			);
		});
	}

	async function collectUploadCandidatesFromEntry(
		entry: FileSystemEntryLike,
		parentPath = ''
	): Promise<UploadCandidate[]> {
		if (entry.isFile) {
			const fileEntry = entry as FileSystemFileEntryLike;
			const file = await getFileFromEntry(fileEntry);
			if (!file) {
				return [];
			}
			const relativePath = normalizeUploadRelativePath(
				parentPath ? `${parentPath}/${entry.name}` : entry.name || file.name
			);
			if (!relativePath) {
				return [];
			}
			return [{ file, relativePath }];
		}

		if (!entry.isDirectory) {
			return [];
		}

		const directoryEntry = entry as FileSystemDirectoryEntryLike;
		const nextParentPath = normalizeUploadRelativePath(
			parentPath ? `${parentPath}/${entry.name}` : entry.name
		);
		const children = await getEntryChildren(directoryEntry);
		const nestedCandidates: UploadCandidate[] = [];
		for (const child of children) {
			const childCandidates = await collectUploadCandidatesFromEntry(child, nextParentPath);
			nestedCandidates.push(...childCandidates);
		}
		return nestedCandidates;
	}

	async function extractDroppedUploadCandidates(event: DragEvent): Promise<UploadCandidate[]> {
		const transfer = event.dataTransfer;
		if (!transfer) {
			return [];
		}

		const candidates: UploadCandidate[] = [];
		if (transfer.items && transfer.items.length > 0) {
			for (const item of Array.from(transfer.items)) {
				if (item.kind !== 'file') {
					continue;
				}

				const entry = (
					item as DataTransferItem & {
						webkitGetAsEntry?: () => FileSystemEntryLike | null;
					}
				).webkitGetAsEntry?.();
				if (entry) {
					const entryCandidates = await collectUploadCandidatesFromEntry(entry);
					candidates.push(...entryCandidates);
					continue;
				}

				const file = item.getAsFile();
				if (!file) {
					continue;
				}
				candidates.push(...buildUploadCandidatesFromFiles([file]));
			}

			return dedupeUploadCandidates(candidates);
		}

		return buildUploadCandidatesFromFileList(transfer.files ?? null);
	}

	function getUploadUrlForDestinationPath(destinationPath: string): string {
		const currentPath = normalizeInventoryPath(data.inventory.currentPath);
		const normalizedDestinationPath = normalizeInventoryPath(destinationPath);
		if (normalizedDestinationPath === currentPath) {
			return data.inventory.uploadUrl;
		}

		const rootPath =
			typeof data.inventory.rootPath === 'string' && data.inventory.rootPath.trim() !== ''
				? normalizeInventoryPath(data.inventory.rootPath)
				: '/';
		const currentUpstreamPath = joinNormalizedPaths(rootPath, currentPath);
		const destinationUpstreamPath = joinNormalizedPaths(rootPath, normalizedDestinationPath);

		try {
			const uploadUrl = new URL(data.inventory.uploadUrl);
			const pathnameSegments = normalizeInventoryPath(uploadUrl.pathname).split('/').filter(Boolean);
			const currentUpstreamSegments = currentUpstreamPath.split('/').filter(Boolean);
			const destinationUpstreamSegments = destinationUpstreamPath.split('/').filter(Boolean);

			const hasCurrentSuffix =
				currentUpstreamSegments.length <= pathnameSegments.length &&
				currentUpstreamSegments.every((segment, index) => {
					const fromEndIndex = pathnameSegments.length - currentUpstreamSegments.length + index;
					return pathnameSegments[fromEndIndex] === segment;
				});
			if (hasCurrentSuffix) {
				const prefixSegments = pathnameSegments.slice(0, pathnameSegments.length - currentUpstreamSegments.length);
				uploadUrl.pathname = `/${[...prefixSegments, ...destinationUpstreamSegments].join('/')}`;
				return uploadUrl.toString();
			}

			uploadUrl.pathname = destinationUpstreamPath;
			return uploadUrl.toString();
		} catch {
			return data.inventory.uploadUrl;
		}
	}

	async function ensureUploadDestinationPath(path: string): Promise<FileActionResponse> {
		const normalizedPath = normalizeInventoryPath(path);
		if (ensuredUploadPaths.has(normalizedPath)) {
			return { ok: true };
		}

		const existingTask = ensureUploadPathTasks.get(normalizedPath);
		if (existingTask) {
			return existingTask;
		}

		const task = (async () => {
			const segments = normalizedPath.split('/').filter(Boolean);
			let cursor = '/';

			for (const segment of segments) {
				const nextPath = cursor === '/' ? `/${segment}` : `${cursor}/${segment}`;
				if (ensuredUploadPaths.has(nextPath)) {
					cursor = nextPath;
					continue;
				}

				const result = await postFileAction({
					action: 'mkdir',
					path: cursor,
					name: segment
				});
				if (!result.ok) {
					const message = result.error?.toLowerCase() ?? '';
					const alreadyExists =
						message.includes('already exists') || message.includes('http 405') || message.includes('http 409');
					if (!alreadyExists) {
						return {
							ok: false,
							error: result.error || `Unable to create folder ${nextPath}.`
						};
					}
				}

				ensuredUploadPaths.add(nextPath);
				cursor = nextPath;
			}

			return { ok: true } as FileActionResponse;
		})();

		ensureUploadPathTasks.set(normalizedPath, task);
		const result = await task;
		if (!result.ok) {
			ensureUploadPathTasks.delete(normalizedPath);
		}
		return result;
	}

	function splitFileName(name: string): { stem: string; ext: string } {
		const dotIndex = name.lastIndexOf('.');
		if (dotIndex <= 0 || dotIndex >= name.length - 1) {
			return { stem: name, ext: '' };
		}
		return {
			stem: name.slice(0, dotIndex),
			ext: name.slice(dotIndex)
		};
	}

	function makeUniqueFileName(baseName: string, reservedNames: Set<string>): string {
		if (!reservedNames.has(baseName)) {
			reservedNames.add(baseName);
			return baseName;
		}

		const { stem, ext } = splitFileName(baseName);
		let index = 2;
		while (true) {
			const candidate = `${stem} (${index})${ext}`;
			if (!reservedNames.has(candidate)) {
				reservedNames.add(candidate);
				return candidate;
			}
			index += 1;
		}
	}

	function buildUploadConflicts(candidates: UploadCandidate[]): UploadConflictItem[] {
		const existingByName = new Map(data.inventory.files.map((entry) => [entry.name, entry]));
		const conflictsByName = new Map<string, UploadConflictItem>();

		for (const candidate of candidates) {
			const { directory, fileName } = splitUploadRelativePath(candidate.relativePath);
			if (directory || !fileName || !existingByName.has(fileName)) {
				continue;
			}
			if (!conflictsByName.has(fileName)) {
				conflictsByName.set(fileName, { name: fileName, size: candidate.file.size });
			}
		}

		return Array.from(conflictsByName.values());
	}

	async function postFileAction(payload: Record<string, unknown>): Promise<FileActionResponse> {
		let response: Response;
		try {
			response = await fetch('/api/files', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(payload)
			});
		} catch {
			return { ok: false, error: 'File action failed (network error).' };
		}

		let body: { ok?: boolean; error?: string } = {};
		try {
			body = (await response.json()) as { ok?: boolean; error?: string };
		} catch {
			body = {};
		}

		if (!response.ok || !body.ok) {
			return {
				ok: false,
				error: body.error || `File action failed (${response.status}).`
			};
		}

		return { ok: true };
	}

	function setFileSelected(fileName: string, selected: boolean) {
		const next = new Set(selectedFileNames);
		if (selected) {
			next.add(fileName);
		} else {
			next.delete(fileName);
		}
		selectedFileNames = next;
	}

	function clearSelectedFiles() {
		selectedFileNames = new Set();
	}

	function toggleSelectAllFiles() {
		if (allFilesSelected) {
			clearSelectedFiles();
			return;
		}

		selectedFileNames = new Set(data.inventory.files.map((file) => file.name));
	}

	function onFileSelectionChange(event: Event, fileName: string) {
		const target = event.currentTarget;
		if (!(target instanceof HTMLInputElement)) {
			return;
		}
		setFileSelected(fileName, target.checked);
	}

	function getSelectedFilePaths(): string[] {
		return data.inventory.files
			.filter((file) => selectedFileNames.has(file.name))
			.map((file) => joinInventoryPath(file.name));
	}

	function isInventoryBusy(): boolean {
		return moveFilesBusy || deleteFilesBusy || folderDeleteBusyPath !== null;
	}

	function buildDragSourcePaths(file: InventoryFile): string[] {
		const clickedPath = joinInventoryPath(file.name);
		if (!selectedFileNames.has(file.name)) {
			return [clickedPath];
		}

		const selectedPaths = getSelectedFilePaths();
		return selectedPaths.length > 0 ? selectedPaths : [clickedPath];
	}

	function isInventoryFileDrag(event: DragEvent): boolean {
		return event.dataTransfer?.types.includes(INVENTORY_DRAG_MIME) ?? false;
	}

	function readDraggedInventoryPaths(event: DragEvent): string[] {
		const raw = event.dataTransfer?.getData(INVENTORY_DRAG_MIME) ?? '';
		if (!raw) {
			return [];
		}

		try {
			const parsed = JSON.parse(raw) as unknown;
			if (!Array.isArray(parsed)) {
				return [];
			}

			const deduped = new Set<string>();
			for (const entry of parsed) {
				if (typeof entry !== 'string') {
					continue;
				}
				const normalized = normalizeInventoryPath(entry);
				if (normalized === '/') {
					continue;
				}
				deduped.add(normalized);
			}

			return Array.from(deduped);
		} catch {
			return [];
		}
	}

	function onFileDragStart(event: DragEvent, file: InventoryFile) {
		if (isInventoryBusy() || !event.dataTransfer) {
			event.preventDefault();
			return;
		}

		const sourcePaths = buildDragSourcePaths(file);
		draggingInventoryPaths = sourcePaths;
		moveFilesError = '';

		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData(INVENTORY_DRAG_MIME, JSON.stringify(sourcePaths));
		event.dataTransfer.setData('text/plain', file.name);
	}

	function onFileDragEnd() {
		draggingInventoryPaths = [];
		activeFolderDropPath = null;
	}

	function isFileBeingDragged(file: InventoryFile): boolean {
		return draggingInventoryPaths.includes(joinInventoryPath(file.name));
	}

	function onFolderDragEnter(event: DragEvent, destinationPath: string | null) {
		if (!destinationPath || isInventoryBusy() || !isInventoryFileDrag(event)) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		activeFolderDropPath = destinationPath;
	}

	function onFolderDragOver(event: DragEvent, destinationPath: string | null) {
		if (!destinationPath || !isInventoryFileDrag(event)) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = isInventoryBusy() ? 'none' : 'move';
		}

		if (!isInventoryBusy()) {
			activeFolderDropPath = destinationPath;
		}
	}

	function onFolderDragLeave(event: DragEvent, destinationPath: string | null) {
		if (!destinationPath || activeFolderDropPath !== destinationPath) {
			return;
		}

		const currentTarget = event.currentTarget;
		const relatedTarget = event.relatedTarget;
		if (
			currentTarget instanceof HTMLElement &&
			relatedTarget instanceof Node &&
			currentTarget.contains(relatedTarget)
		) {
			return;
		}

		activeFolderDropPath = null;
	}

	async function onFolderDrop(event: DragEvent, destinationPath: string | null) {
		event.preventDefault();
		event.stopPropagation();
		activeFolderDropPath = null;

		if (!destinationPath || isInventoryBusy()) {
			return;
		}

		const sourcePaths = readDraggedInventoryPaths(event);
		if (sourcePaths.length === 0) {
			return;
		}

		await moveFilesToFolder(sourcePaths, destinationPath);
	}

	async function moveFilesToFolder(sourcePaths: string[], destinationPath: string) {
		if (isInventoryBusy()) {
			return;
		}

		const normalizedDestination = normalizeInventoryPath(destinationPath);
		const candidates = Array.from(new Set(sourcePaths.map((path) => normalizeInventoryPath(path)))).filter(
			(path) => path !== '/' && getParentInventoryPath(path) !== normalizedDestination
		);

		if (candidates.length === 0) {
			moveFilesError = 'Selected files are already in that folder.';
			return;
		}

		moveFilesBusy = true;
		moveFilesError = '';

		let movedCount = 0;
		const movedPaths: string[] = [];
		let firstError = '';

		for (const sourcePath of candidates) {
			const result = await postFileAction({
				action: 'move',
				path: sourcePath,
				destinationPath: normalizedDestination
			});

			if (!result.ok) {
				firstError = `${getInventoryLeafName(sourcePath)}: ${result.error || 'Unable to move file.'}`;
				break;
			}

			movedCount += 1;
			movedPaths.push(sourcePath);
		}

		moveFilesBusy = false;
		draggingInventoryPaths = [];

		if (movedPaths.length > 0) {
			const movedNames = new Set(movedPaths.map((path) => getInventoryLeafName(path)));
			const nextSelection = new Set(selectedFileNames);
			for (const name of movedNames) {
				nextSelection.delete(name);
			}
			selectedFileNames = nextSelection;

			if (activeFile && movedNames.has(activeFile.name)) {
				closeFileViewer();
			}
			await invalidateAll();
		}

		if (firstError) {
			moveFilesError =
				movedCount > 0
					? `Moved ${movedCount} file${movedCount === 1 ? '' : 's'}; stopped at ${firstError}`
					: firstError;
			return;
		}

		moveFilesError = '';
		playFolderClickSfx();
	}

	async function onDeleteSelectedFiles() {
		if (isInventoryBusy() || selectedFileCount === 0) {
			return;
		}

		const selectedPaths = getSelectedFilePaths();
		if (selectedPaths.length === 0) {
			moveFilesError = 'No files selected.';
			return;
		}

		if (browser) {
			const confirmed = window.confirm(
				`Delete ${selectedPaths.length} selected file${selectedPaths.length === 1 ? '' : 's'}?`
			);
			if (!confirmed) {
				return;
			}
		}

		deleteFilesBusy = true;
		moveFilesError = '';
		playMenuItemSfx();

		let deletedCount = 0;
		const deletedPaths: string[] = [];
		let firstError = '';

		for (const sourcePath of selectedPaths) {
			const result = await postFileAction({
				action: 'delete',
				path: sourcePath
			});

			if (!result.ok) {
				firstError = `${getInventoryLeafName(sourcePath)}: ${result.error || 'Unable to delete file.'}`;
				break;
			}

			deletedCount += 1;
			deletedPaths.push(sourcePath);
		}

		deleteFilesBusy = false;

		if (deletedPaths.length > 0) {
			const deletedNames = new Set(deletedPaths.map((path) => getInventoryLeafName(path)));
			const nextSelection = new Set(selectedFileNames);
			for (const name of deletedNames) {
				nextSelection.delete(name);
			}
			selectedFileNames = nextSelection;

			if (activeFile && deletedNames.has(activeFile.name)) {
				closeFileViewer();
			}

			await invalidateAll();
		}

		if (firstError) {
			moveFilesError =
				deletedCount > 0
					? `Deleted ${deletedCount} file${deletedCount === 1 ? '' : 's'}; stopped at ${firstError}`
					: firstError;
			return;
		}

		moveFilesError = '';
	}

	function openFileActionDialog(event: MouseEvent, file: InventoryFile) {
		event.stopPropagation();
		event.preventDefault();
		playMenuItemSfx();
		playSfx('dialogOpen');
		fileActionError = '';
		fileActionFile = file;
		fileActionOpen = true;
	}

	function closeFileActionDialog() {
		if (fileActionOpen) {
			playSfx('dialogClose');
		}
		fileActionOpen = false;
		fileActionBusy = false;
		fileActionError = '';
		fileActionFile = null;
	}

	async function onRenameFile(event: CustomEvent<{ nextName: string }>) {
		if (!fileActionFile || fileActionBusy) {
			return;
		}

		const nextName = event.detail.nextName.trim();
		if (!nextName || nextName === fileActionFile.name) {
			return;
		}

		fileActionBusy = true;
		fileActionError = '';
		const currentPath = joinInventoryPath(fileActionFile.name);
		const result = await postFileAction({
			action: 'rename',
			path: currentPath,
			newName: nextName
		});

		fileActionBusy = false;
		if (!result.ok) {
			fileActionError = result.error || 'Unable to rename file.';
			return;
		}

		closeFileActionDialog();
		void invalidateAll();
	}

	async function onDeleteFile() {
		if (!fileActionFile || fileActionBusy) {
			return;
		}

		fileActionBusy = true;
		fileActionError = '';
		const currentPath = joinInventoryPath(fileActionFile.name);
		const result = await postFileAction({
			action: 'delete',
			path: currentPath
		});

		fileActionBusy = false;
		if (!result.ok) {
			fileActionError = result.error || 'Unable to delete file.';
			return;
		}

		if (activeFile?.href === fileActionFile.href) {
			closeFileViewer();
		}
		closeFileActionDialog();
		void invalidateAll();
	}

	async function onCreateFolderSubmit() {
		if (newFolderBusy) {
			return;
		}

		const folderName = newFolderName.trim();
		if (!folderName) {
			newFolderError = 'Folder name is required.';
			return;
		}

		newFolderBusy = true;
		newFolderError = '';
		folderDeleteError = '';
		playMenuItemSfx();
		const result = await postFileAction({
			action: 'mkdir',
			path: data.inventory.currentPath,
			name: folderName
		});

		newFolderBusy = false;
		if (!result.ok) {
			newFolderError = result.error || 'Unable to create folder.';
			return;
		}

		newFolderName = '';
		void invalidateAll();
	}

	async function onDeleteFolder(event: MouseEvent, folderPath: string | null, folderName: string) {
		event.preventDefault();
		event.stopPropagation();

		if (!folderPath || isInventoryBusy()) {
			return;
		}

		if (browser) {
			const confirmed = window.confirm(
				`Delete folder "${folderName}" and ALL files/subfolders inside it? This cannot be undone.`
			);
			if (!confirmed) {
				return;
			}
		}

		folderDeleteBusyPath = folderPath;
		folderDeleteError = '';
		playMenuItemSfx();

		const result = await postFileAction({
			action: 'delete',
			path: folderPath
		});

		folderDeleteBusyPath = null;

		if (!result.ok) {
			folderDeleteError = `${folderName}: ${result.error || 'Unable to delete folder.'}`;
			return;
		}

		if (activeFolderDropPath === folderPath) {
			activeFolderDropPath = null;
		}

		await invalidateAll();
	}

	function openUploadConflictDialog(
		conflicts: UploadConflictItem[],
		candidates: UploadCandidate[],
		destinationPath: string
	) {
		uploadConflictItems = conflicts;
		pendingUploadFiles = candidates;
		pendingUploadDestinationPath = destinationPath;
		uploadConflictOpen = true;
		playSfx('dialogOpen');
	}

	function closeUploadConflictDialog() {
		if (uploadConflictOpen) {
			playSfx('dialogClose');
		}
		uploadConflictOpen = false;
		uploadConflictItems = [];
		pendingUploadFiles = [];
		pendingUploadDestinationPath = '';
	}

	function onResolveUploadConflict(event: CustomEvent<{ strategy: ConflictStrategy }>) {
		const strategy = event.detail.strategy;
		const candidates = pendingUploadFiles;
		const destinationPath = pendingUploadDestinationPath || data.inventory.currentPath;
		closeUploadConflictDialog();
		void enqueueUploads(candidates, strategy, destinationPath);
	}

	function toggleUploadDrawer() {
		uploadDrawerOpen = !uploadDrawerOpen;
		playSfx(uploadDrawerOpen ? 'dialogOpen' : 'dialogClose');
	}

	function openForgePicker() {
		if (!forgeUploadsEnabled || forgePreparing) {
			return;
		}

		playMenuItemSfx();
		forgeFileInput?.click();
	}

	function openForgeFolderPicker() {
		if (!forgeUploadsEnabled || forgePreparing) {
			return;
		}

		playMenuItemSfx();
		forgeFolderInput?.click();
	}

	async function onForgeFileInputChange(event: Event) {
		const target = event.currentTarget;
		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		if (forgePreparing) {
			target.value = '';
			return;
		}

		setForgePreparationState('Reading selected files...', 8);
		const candidates = buildUploadCandidatesFromFileList(target.files ?? null);
		target.value = '';
		await queueFilesForUpload(candidates);
	}

	async function onForgeFolderInputChange(event: Event) {
		const target = event.currentTarget;
		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		if (forgePreparing) {
			target.value = '';
			return;
		}

		setForgePreparationState('Reading folder contents...', 5);
		const candidates = buildUploadCandidatesFromFileList(target.files ?? null);
		if (candidates.length === 0) {
			clearForgePreparationState();
			forgeDropError = 'Folder picker returned no files. Your mobile browser may not support folder selection.';
			target.value = '';
			return;
		}

		target.value = '';
		await queueFilesForUpload(candidates);
	}

	function enableDirectoryPicker(node: HTMLInputElement) {
		node.setAttribute('webkitdirectory', '');
		node.setAttribute('directory', '');
		return {
			destroy() {
				node.removeAttribute('webkitdirectory');
				node.removeAttribute('directory');
			}
		};
	}

	function createTransferId(): string {
		if (browser && typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
			return crypto.randomUUID();
		}
		return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	}

	async function queueFilesForUpload(candidates: UploadCandidate[]) {
		forgeDropError = '';

		if (candidates.length === 0) {
			clearForgePreparationState();
			forgeDropError = 'No files detected.';
			return;
		}

		if (!forgeUploadsEnabled) {
			clearForgePreparationState();
			forgeDropError = 'Forge upload target is unavailable.';
			return;
		}

		const validCandidates = candidates.filter(
			(candidate) => candidate.file && candidate.file.name.trim() !== '' && candidate.relativePath.trim() !== ''
		);
		if (validCandidates.length === 0) {
			clearForgePreparationState();
			forgeDropError = 'No valid files detected.';
			return;
		}

		const destinationPath = normalizeInventoryPath(data.inventory.currentPath);
		setForgePreparationState('Checking file conflicts...', 20);
		const conflicts = buildUploadConflicts(validCandidates);
		if (conflicts.length > 0) {
			clearForgePreparationState();
			openUploadConflictDialog(conflicts, validCandidates, destinationPath);
			return;
		}

		await enqueueUploads(validCandidates, 'skip', destinationPath);
	}

	async function enqueueUploads(candidates: UploadCandidate[], strategy: ConflictStrategy, destinationPath: string) {
		if (!forgeUploadsEnabled) {
			clearForgePreparationState();
			forgeDropError = 'Forge upload target is unavailable.';
			return;
		}

		const normalizedDestinationPath = normalizeInventoryPath(destinationPath);
		const existingNamesByDestination = new Map<string, Set<string>>([
			[normalizedDestinationPath, new Set(data.inventory.files.map((entry) => entry.name))]
		]);
		const reservedNamesByDestination = new Map<string, Set<string>>();
		let enqueuedCount = 0;
		let batchItems: TransferItem[] = [];

		const getReservedNames = (path: string): Set<string> => {
			const existing = reservedNamesByDestination.get(path);
			if (existing) {
				return existing;
			}
			const seededNames = new Set(existingNamesByDestination.get(path) ?? []);
			reservedNamesByDestination.set(path, seededNames);
			return seededNames;
		};

		setForgePreparationState(createUploadPrepLabel('Queueing', 0, candidates.length), 0);

		try {
			for (let index = 0; index < candidates.length; index += 1) {
				const candidate = candidates[index];
				const normalizedRelativePath = normalizeUploadRelativePath(candidate.relativePath);
				const { directory, fileName } = splitUploadRelativePath(normalizedRelativePath);
				const sourceName = fileName.trim();
				if (!sourceName) {
					continue;
				}

				const resolvedDestinationPath = directory
					? joinNormalizedPaths(normalizedDestinationPath, directory)
					: normalizedDestinationPath;
				const reservedNames = getReservedNames(resolvedDestinationPath);
				const existingNames = existingNamesByDestination.get(resolvedDestinationPath) ?? new Set<string>();
				const hasConflict = reservedNames.has(sourceName);
				const existsOnServer = existingNames.has(sourceName);

				if (hasConflict && strategy === 'skip') {
					continue;
				}

				let targetName = sourceName;
				let replaceExisting = false;
				if (strategy === 'rename') {
					targetName = makeUniqueFileName(sourceName, reservedNames);
				} else if (strategy === 'replace') {
					if (existsOnServer && resolvedDestinationPath === normalizedDestinationPath) {
						replaceExisting = true;
						reservedNames.add(targetName);
					} else if (hasConflict) {
						targetName = makeUniqueFileName(sourceName, reservedNames);
					} else {
						reservedNames.add(targetName);
					}
				} else {
					reservedNames.add(targetName);
				}

				batchItems.push({
					id: createTransferId(),
					file: candidate.file,
					sourceName,
					targetName,
					targetPath: joinNormalizedPaths(resolvedDestinationPath, targetName),
					destinationPath: resolvedDestinationPath,
					uploadUrl: getUploadUrlForDestinationPath(resolvedDestinationPath),
					name: normalizedRelativePath || targetName,
					size: candidate.file.size,
					loaded: 0,
					progress: 0,
					status: 'queued',
					replaceExisting
				});
				enqueuedCount += 1;

				const isBatchBoundary = (index + 1) % UPLOAD_ENQUEUE_BATCH_SIZE === 0 || index + 1 === candidates.length;
				if (!isBatchBoundary) {
					continue;
				}

				if (batchItems.length > 0) {
					transferItems.push(...batchItems);
					uploadQueue.push(...batchItems);
					batchItems = [];
					touchTransferItems(true);
					processUploadQueue();
				}

				const processed = index + 1;
				setForgePreparationState(
					createUploadPrepLabel('Queueing', processed, candidates.length),
					(processed / Math.max(candidates.length, 1)) * 100
				);
				pruneFinishedTransferHistory();
				await yieldToMainThread();
			}
		} finally {
			clearForgePreparationState();
		}

		if (enqueuedCount === 0) {
			forgeDropError = strategy === 'skip' ? 'All conflicting files were skipped.' : 'No files to upload.';
			return;
		}

		forgeDropError = '';
		uploadDrawerOpen = true;
		playSfx('fileClick');
		processUploadQueue();
	}

	function processUploadQueue() {
		while (activeUploads < uploadConcurrencyLimit && uploadQueue.length > 0) {
			const next = uploadQueue.shift();
			if (!next || next.status !== 'queued') {
				continue;
			}
			void startUpload(next);
		}
	}

	function finishUpload(item: TransferItem) {
		item.xhr = undefined;
		activeUploads = Math.max(0, activeUploads - 1);
		processUploadQueue();
		pruneFinishedTransferHistory();
		touchTransferItems(true);

		if (activeUploads === 0 && uploadQueue.length === 0 && needsInventoryRefresh) {
			needsInventoryRefresh = false;
			void invalidateAll();
		}
	}

	async function finalizeUploadedItem(item: TransferItem): Promise<void> {
		const sourceParentPath = getParentInventoryPath(item.targetPath);
		const destinationPath = normalizeInventoryPath(item.destinationPath);
		if (!sourceParentPath || destinationPath === sourceParentPath) {
			item.status = 'complete';
			item.loaded = item.size || item.loaded;
			item.progress = 100;
			return;
		}

		const moveResult = await postFileAction({
			action: 'move',
			path: item.targetPath,
			destinationPath
		});
		if (!moveResult.ok) {
			item.status = 'error';
			item.error = moveResult.error || 'Upload complete but move failed.';
			return;
		}

		item.status = 'complete';
		item.loaded = item.size || item.loaded;
		item.progress = 100;
	}

	async function startUpload(item: TransferItem) {
		activeUploads += 1;
		item.status = 'uploading';
		item.progress = 0;
		item.loaded = 0;
		item.error = undefined;
		touchTransferItems(true);

		const ensureDestinationResult = await ensureUploadDestinationPath(item.destinationPath);
		if (!ensureDestinationResult.ok) {
			item.status = 'error';
			item.error = ensureDestinationResult.error || 'Unable to prepare destination folder.';
			finishUpload(item);
			return;
		}

		if (item.replaceExisting) {
			const deleteResult = await postFileAction({
				action: 'delete',
				path: item.targetPath
			});

			const allowMissingDelete =
				typeof deleteResult.error === 'string' && deleteResult.error.includes('HTTP 404');
			if (!deleteResult.ok && !allowMissingDelete) {
				item.status = 'error';
				item.error = deleteResult.error || `Unable to replace ${item.targetName}.`;
				finishUpload(item);
				return;
			}
		}

		const formData = new FormData();
		formData.append('f', item.file, item.targetName);

		const targetUrl = new URL(item.uploadUrl);
		targetUrl.searchParams.set('j', '');

		const xhr = new XMLHttpRequest();
		item.xhr = xhr;

		xhr.upload.addEventListener('progress', (event) => {
			if (!event.lengthComputable) {
				return;
			}

			item.loaded = event.loaded;
			item.progress = Math.min(100, Math.round((event.loaded / event.total) * 100));
			touchTransferItems();
		});

		xhr.addEventListener('load', () => {
			void (async () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					await finalizeUploadedItem(item);
					needsInventoryRefresh = true;
				} else {
					item.status = 'error';
					item.error = `Upload failed (${xhr.status})`;
				}

				finishUpload(item);
			})();
		});

		xhr.addEventListener('error', () => {
			item.status = 'error';
			item.error = 'Upload failed (network error)';
			finishUpload(item);
		});

		xhr.addEventListener('abort', () => {
			item.status = 'error';
			item.error = 'Upload canceled';
			finishUpload(item);
		});

		xhr.open('POST', targetUrl.toString());
		xhr.send(formData);
	}

	function cancelTransfer(itemId: string) {
		const item = transferItems.find((entry) => entry.id === itemId);
		if (!item) {
			return;
		}

		if (item.status === 'queued') {
			const queueIndex = uploadQueue.findIndex((entry) => entry.id === item.id);
			if (queueIndex !== -1) {
				uploadQueue.splice(queueIndex, 1);
			}
			item.status = 'error';
			item.error = 'Upload canceled';
			touchTransferItems(true);
			return;
		}

		if (item.status === 'uploading') {
			item.xhr?.abort();
		}
	}

	function dismissTransfer(itemId: string) {
		transferItems = transferItems.filter((entry) => entry.id !== itemId);
	}

	function clearFinishedTransfers() {
		transferItems = transferItems.filter((item) => isTransferActive(item.status));
	}

	function onForgeDragEnter(event: DragEvent) {
		if (!forgeUploadsEnabled || forgePreparing || !event.dataTransfer?.types.includes('Files')) {
			return;
		}
		event.preventDefault();
		forgeDragDepth += 1;
		forgeDragActive = true;
	}

	function onForgeDragOver(event: DragEvent) {
		if (!event.dataTransfer?.types.includes('Files')) {
			return;
		}
		event.preventDefault();
		event.dataTransfer.dropEffect = forgeUploadsEnabled && !forgePreparing ? 'copy' : 'none';
	}

	function onForgeDragLeave(event: DragEvent) {
		if (!forgeUploadsEnabled || forgePreparing) {
			return;
		}
		event.preventDefault();
		forgeDragDepth = Math.max(0, forgeDragDepth - 1);
		if (forgeDragDepth === 0) {
			forgeDragActive = false;
		}
	}

	async function onForgeDrop(event: DragEvent) {
		event.preventDefault();
		forgeDragDepth = 0;
		forgeDragActive = false;

		if (!forgeUploadsEnabled || forgePreparing) {
			return;
		}

		try {
			setForgePreparationState('Scanning dropped folder contents...', 4);
			const candidates = await extractDroppedUploadCandidates(event);
			await queueFilesForUpload(candidates);
		} catch {
			clearForgePreparationState();
			forgeDropError = 'Unable to read dropped folder contents.';
		}
	}

	function formatSize(sizeBytes: number): string {
		if (sizeBytes >= 1024 ** 3) {
			return `${(sizeBytes / 1024 ** 3).toFixed(2)} GB`;
		}

		if (sizeBytes >= 1024 ** 2) {
			return `${(sizeBytes / 1024 ** 2).toFixed(1)} MB`;
		}

		if (sizeBytes >= 1024) {
			return `${(sizeBytes / 1024).toFixed(1)} KB`;
		}

		return `${sizeBytes} B`;
	}

	function resolveFileType(name: string, extension: string | null): string {
		const normalizedExtension = extension?.trim().toLowerCase();
		if (normalizedExtension) {
			return normalizedExtension;
		}

		const dotIndex = name.lastIndexOf('.');
		if (dotIndex > -1 && dotIndex < name.length - 1) {
			return name.slice(dotIndex + 1).toLowerCase();
		}

		return 'file';
	}

	function toThumbnailUrl(href: string): string {
		try {
			const url = new URL(href);
			url.searchParams.set('th', 'w');
			return url.toString();
		} catch {
			return href;
		}
	}

	function formatModified(modified: string, modifiedTs: number): string {
		const text = modified.trim();
		if (text !== '') {
			return text;
		}

		if (!Number.isFinite(modifiedTs) || modifiedTs <= 0) {
			return 'Unknown';
		}

		const epochMs = modifiedTs > 10_000_000_000 ? modifiedTs : modifiedTs * 1000;
		try {
			return modifiedFormatter.format(new Date(epochMs));
		} catch {
			return 'Unknown';
		}
	}

	function toPathHref(path: string | null): string {
		const safePath = path && path.trim() !== '' ? path : '/';
		return `?path=${encodeURIComponent(safePath)}&tab=${encodeURIComponent(activeSidebarTab)}`;
	}

	function toActiveViewerFile(file: InventoryFile): ActiveViewerFile {
		return {
			name: file.name,
			type: resolveFileType(file.name, file.extension),
			sizeBytes: file.size,
			modified: formatModified(file.modified, file.modifiedTs),
			href: file.href
		};
	}

	function openFileViewer(file: InventoryFile) {
		playSfx('dialogOpen');
		previewSelectedFileName = file.name;
		activeFile = toActiveViewerFile(file);
		viewerOpen = true;
	}

	function closeFileViewer() {
		if (viewerOpen) {
			playSfx('dialogClose');
		}
		viewerOpen = false;
	}

	function goToViewerSiblingFile(direction: -1 | 1) {
		if (!activeFile || filteredSortedFiles.length === 0) {
			return;
		}

		const targetIndex = activeFileIndex + direction;
		if (targetIndex < 0 || targetIndex >= filteredSortedFiles.length) {
			return;
		}

		const targetFile = filteredSortedFiles[targetIndex];
		previewSelectedFileName = targetFile.name;
		activeFile = toActiveViewerFile(targetFile);
	}

	function toggleSort(nextKey: SortKey) {
		if (sortKey === nextKey) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
			return;
		}

		sortKey = nextKey;
		sortDirection = 'asc';
	}

	function sortIndicator(key: SortKey): string {
		if (sortKey !== key) {
			return '';
		}

		return sortDirection === 'asc' ? '▲' : '▼';
	}

	function compareFiles(
		a: { name: string; size: number; modifiedTs: number; extension: string | null },
		b: { name: string; size: number; modifiedTs: number; extension: string | null },
		key: SortKey,
		direction: SortDirection
	): number {
		let result = 0;

		if (key === 'name') {
			result = sortCollator.compare(a.name, b.name);
		} else if (key === 'type') {
			const aType = resolveFileType(a.name, a.extension);
			const bType = resolveFileType(b.name, b.extension);
			result = sortCollator.compare(aType, bType);
			if (result === 0) {
				result = sortCollator.compare(a.name, b.name);
			}
		} else if (key === 'size') {
			result = Math.sign(a.size - b.size);
			if (result === 0) {
				result = sortCollator.compare(a.name, b.name);
			}
		} else {
			result = Math.sign(a.modifiedTs - b.modifiedTs);
			if (result === 0) {
				result = sortCollator.compare(a.name, b.name);
			}
		}

		return direction === 'asc' ? result : -result;
	}

	function getFileBadge(type: string): { label: string; tone: FileBadgeTone } {
		const normalized = type.toLowerCase();

		if (IMAGE_TYPES.has(normalized)) {
			return { label: 'IMG', tone: 'tone-image' };
		}
		if (VIDEO_TYPES.has(normalized)) {
			return { label: 'VID', tone: 'tone-video' };
		}
		if (AUDIO_TYPES.has(normalized)) {
			return { label: 'AUD', tone: 'tone-audio' };
		}
		if (ARCHIVE_TYPES.has(normalized)) {
			return { label: 'ZIP', tone: 'tone-archive' };
		}
		if (CODE_TYPES.has(normalized)) {
			return { label: 'SRC', tone: 'tone-code' };
		}
		if (TEXT_TYPES.has(normalized)) {
			return { label: 'TXT', tone: 'tone-text' };
		}

		return { label: 'FILE', tone: 'tone-other' };
	}

	$: {
		const key = sortKey;
		const direction = sortDirection;
		sortedFiles = [...data.inventory.files].sort((a, b) => compareFiles(a, b, key, direction));
	}
	$: normalizedInventorySearchQuery = inventorySearchQuery.trim().toLowerCase();
	$: filteredDirectories = normalizedInventorySearchQuery
		? data.inventory.directories.filter((folder) =>
				folder.name.toLowerCase().includes(normalizedInventorySearchQuery)
			)
		: data.inventory.directories;
	$: filteredSortedFiles = normalizedInventorySearchQuery
		? sortedFiles.filter((file) => {
				const fileType = resolveFileType(file.name, file.extension).toLowerCase();
				return (
					file.name.toLowerCase().includes(normalizedInventorySearchQuery) ||
					fileType.includes(normalizedInventorySearchQuery)
				);
			})
		: sortedFiles;
	$: {
		if (selectedFileNames.size > 0) {
			const availableNames = new Set(data.inventory.files.map((file) => file.name));
			let changed = false;
			const next = new Set<string>();
			for (const name of selectedFileNames) {
				if (availableNames.has(name)) {
					next.add(name);
				} else {
					changed = true;
				}
			}
			if (changed) {
				selectedFileNames = next;
			}
		}
	}
	$: {
		if (previewSelectedFileName) {
			const hasPreviewSelection = data.inventory.files.some((file) => file.name === previewSelectedFileName);
			if (!hasPreviewSelection) {
				previewSelectedFileName = null;
			}
		}
	}
	$: {
		const viewerFile = activeFile;
		if (!viewerFile) {
			activeFileIndex = -1;
		} else {
			activeFileIndex = filteredSortedFiles.findIndex(
				(file) => file.name === viewerFile.name && file.href === viewerFile.href
			);
		}
	}
	$: canGoToPreviousFile = activeFileIndex > 0;
	$: canGoToNextFile = activeFileIndex >= 0 && activeFileIndex < filteredSortedFiles.length - 1;
	$: selectedFileCount = selectedFileNames.size;
	$: allFilesSelected = data.inventory.files.length > 0 && selectedFileCount === data.inventory.files.length;
	$: {
		const nextSidebarTabSyncKey = `${data.inventory.currentPath}|${data.initialTab}`;
		if (nextSidebarTabSyncKey !== sidebarTabSyncKey) {
			sidebarTabSyncKey = nextSidebarTabSyncKey;
			activeSidebarTab = data.initialTab;
		}
	}
	$: {
		let cursor = '/';
		ensuredUploadPaths.add(cursor);
		for (const segment of normalizeInventoryPath(data.inventory.currentPath).split('/').filter(Boolean)) {
			cursor = cursor === '/' ? `/${segment}` : `${cursor}/${segment}`;
			ensuredUploadPaths.add(cursor);
		}
	}
	$: forgeUploadsEnabled = data.inventory.uploadUrl.trim() !== '';
	$: activeTransferCount = activeUploads + uploadQueue.length;
	$: visibleTransferItems = transferItems.slice(-MAX_VISIBLE_TRANSFER_ITEMS).reverse();
	$: hiddenTransferItemCount = Math.max(0, transferItems.length - visibleTransferItems.length);

</script>

<div class="app-shell">
	<div class="two-col">
		<aside>
			<!-- ======================================================================= -->
			<!-- SIDEBAR: BRAND -->
			<!-- ======================================================================= -->
			<div class="sidebar-top">
				<h1 class="brand-title">Titan&apos;s Pit</h1>
				<p class="brand-line">Atlas Academy's central vault.</p>
				<p class="brand-line">Path: {data.inventory.currentPath}</p>
				<p class="brand-line">
					Dirs: {data.inventory.directories.length} / Files: {data.inventory.files.length}
				</p>
				{#if data.inventory.account}
					<p class="brand-line">Account: {data.inventory.account}</p>
				{/if}
				{#if !data.inventory.configured}
					<p class="status-warning">COPYPARTY_BASE_URL is not configured.</p>
				{:else if data.inventory.error}
					<p class="status-warning">{data.inventory.error}</p>
				{/if}
			</div>

			<div class="sidebar-tabs-wrap">
				<div class="sidebar-tabs" role="tablist" aria-label="Main sections">
					<button
						type="button"
						role="tab"
						class="sidebar-tab-btn"
						class:active={activeSidebarTab === 'inventions'}
						aria-selected={activeSidebarTab === 'inventions'}
						on:pointerenter={playHoverSfx}
						on:focus={playHoverSfx}
						on:click={() => setSidebarTab('inventions')}
					>
						Inventions
					</button>
					<button
						type="button"
						role="tab"
						class="sidebar-tab-btn"
						class:active={activeSidebarTab === 'forge'}
						aria-selected={activeSidebarTab === 'forge'}
						on:pointerenter={playHoverSfx}
						on:focus={playHoverSfx}
						on:click={() => setSidebarTab('forge')}
					>
						Forge
					</button>
				</div>
				<div class="sidebar-search">
					<label class="sidebar-search-label" for="inventory-sidebar-search">Search</label>
					<input
						id="inventory-sidebar-search"
						class="sidebar-search-input"
						type="search"
						bind:value={inventorySearchQuery}
						placeholder={activeSidebarTab === 'forge' ? 'Search folders...' : 'Search files or folders...'}
						autocomplete="off"
						spellcheck="false"
						on:pointerenter={playHoverSfx}
						on:focus={playHoverSfx}
					/>
				</div>
			</div>

			<div class="sidebar-bottom-panel">
				{#if activeSidebarTab === 'inventions'}
					<p class="brand-line">Sort and preview your inventory.</p>
					<p class="brand-line">Click once to select, click again to open preview.</p>
					<div class="file-selection-tools sidebar-file-selection-tools">
						<span class="file-selection-count">{selectedFileCount} selected</span>
						<div class="sidebar-file-selection-actions">
							<button
								type="button"
								class="file-selection-btn"
								on:pointerenter={playHoverSfx}
								on:focus={playHoverSfx}
								on:click={toggleSelectAllFiles}
								disabled={data.inventory.files.length === 0 || isInventoryBusy()}
							>
								{allFilesSelected ? 'Unselect all' : 'Select all'}
							</button>
							<button
								type="button"
								class="file-selection-btn"
								on:pointerenter={playHoverSfx}
								on:focus={playHoverSfx}
								on:click={clearSelectedFiles}
								disabled={selectedFileCount === 0 || isInventoryBusy()}
							>
								Clear
							</button>
							{#if selectedFileCount > 0}
								<button
									type="button"
									class="file-selection-btn file-selection-btn--danger sidebar-delete-selected-btn"
									on:pointerenter={playHoverSfx}
									on:focus={playHoverSfx}
									on:click={onDeleteSelectedFiles}
									disabled={isInventoryBusy()}
								>
									{deleteFilesBusy ? 'Deleting...' : 'Delete all'}
								</button>
							{/if}
						</div>
					</div>
				{:else}
					<p class="brand-line">Forge uploads into the active path.</p>
					<p class="brand-line">Target: {data.inventory.currentPath}</p>
					<p class="brand-line">Active transfers: {activeTransferCount}</p>
				{/if}
			</div>
		</aside>

		<main>
			{#if activeSidebarTab === 'inventions'}
				<div class="main-content" class:folders-expanded={foldersPanelExpanded}>
					<!-- ======================================================================= -->
					<!-- MAIN: FOLDERS -->
					<!-- ======================================================================= -->
					<div class="folder-div">
						<div class="section-head">
							<div class="section-title-row">
								<div class="section-title">Folders</div>
								<button
									type="button"
									class="section-expand-btn"
									class:active={foldersPanelExpanded}
									aria-label={foldersPanelExpanded ? 'Restore default split' : 'Expand folders section'}
									aria-pressed={foldersPanelExpanded}
									title={foldersPanelExpanded ? 'Restore default split' : 'Expand folders section'}
									on:pointerenter={playHoverSfx}
									on:focus={playHoverSfx}
									on:click={toggleFoldersPanelExpanded}
								>
									^
								</button>
							</div>
							<form class="folder-create" on:submit|preventDefault={onCreateFolderSubmit}>
								<input
									type="text"
									bind:value={newFolderName}
									placeholder="new-folder"
									aria-label="New folder name"
									disabled={newFolderBusy}
									spellcheck="false"
								/>
								<button
									type="submit"
									on:pointerenter={playHoverSfx}
									on:focus={playHoverSfx}
									disabled={newFolderBusy}
								>
									Create
								</button>
							</form>
						</div>
						{#if newFolderError}
							<p class="folder-error">{newFolderError}</p>
						{/if}
						{#if folderDeleteError}
							<p class="folder-error">{folderDeleteError}</p>
						{/if}
						<div class="folder-grid">
							{#if data.inventory.parentPath}
								<a
									class="folder-item folder-item-link parent-folder"
									class:drop-target={activeFolderDropPath === data.inventory.parentPath}
									class:drop-disabled={isInventoryBusy()}
									href={toPathHref(data.inventory.parentPath)}
									on:pointerenter={playHoverSfx}
									on:focus={playHoverSfx}
									on:click={playFolderClickSfx}
									on:dragenter={(event) => onFolderDragEnter(event, data.inventory.parentPath)}
									on:dragover={(event) => onFolderDragOver(event, data.inventory.parentPath)}
									on:dragleave={(event) => onFolderDragLeave(event, data.inventory.parentPath)}
									on:drop={(event) => onFolderDrop(event, data.inventory.parentPath)}
								>
									<span class="folder-name">..</span>
									<span class="folder-meta">Parent directory</span>
								</a>
							{/if}

							{#if data.inventory.error}
								<div class="empty-state">Folder listing unavailable.</div>
							{:else if filteredDirectories.length === 0}
								<div class="empty-state">
									{normalizedInventorySearchQuery ? 'No folders match your search.' : 'No folders in this location.'}
								</div>
							{:else}
								{#each filteredDirectories as folder}
									<div
										class="folder-item-shell"
										class:drop-target={activeFolderDropPath === folder.nextPath}
										class:drop-disabled={isInventoryBusy()}
										role="group"
										aria-label={`Folder tile for ${folder.name}`}
										on:dragenter={(event) => onFolderDragEnter(event, folder.nextPath)}
										on:dragover={(event) => onFolderDragOver(event, folder.nextPath)}
										on:dragleave={(event) => onFolderDragLeave(event, folder.nextPath)}
										on:drop={(event) => onFolderDrop(event, folder.nextPath)}
									>
										<a
											class="folder-item folder-item-link"
											href={toPathHref(folder.nextPath)}
											on:pointerenter={playHoverSfx}
											on:focus={playHoverSfx}
											on:click={playFolderClickSfx}
										>
											<span class="folder-name">{folder.name}</span>
											<span class="folder-meta">Open directory</span>
										</a>
										<button
											type="button"
											class="folder-delete-btn"
											on:pointerenter={playHoverSfx}
											on:focus={playHoverSfx}
											on:click={(event) => onDeleteFolder(event, folder.nextPath, folder.name)}
											disabled={isInventoryBusy() || folder.nextPath === null}
											aria-label={`Delete folder ${folder.name}`}
										>
											{folderDeleteBusyPath === folder.nextPath ? '...' : 'Del'}
										</button>
									</div>
								{/each}
							{/if}
						</div>
					</div>

					<!-- ======================================================================= -->
					<!-- MAIN: FILES -->
					<!-- ======================================================================= -->
					<div class="file-div">
						<div class="section-head">
							<div class="section-title-row">
								<div class="section-title">Files</div>
								<button
									type="button"
									class="section-expand-btn"
									class:active={!foldersPanelExpanded}
									aria-label="Expand files section"
									aria-pressed={!foldersPanelExpanded}
									title="Expand files section"
									on:pointerenter={playHoverSfx}
									on:focus={playHoverSfx}
									on:click={setFilesPanelPriority}
								>
									v
								</button>
							</div>
							<div class="file-view-toggle">
								<button
									type="button"
									class:active={fileViewMode === 'list'}
									on:click={() => (fileViewMode = 'list')}
								>List</button>
								<button
									type="button"
									class:active={fileViewMode === 'grid'}
									on:click={() => (fileViewMode = 'grid')}
								>Grid</button>
							</div>
						</div>
						{#if fileViewMode === 'list'}
							<p class="file-move-hint">Drag file rows onto folder tiles to move. Select multiple first for bulk move.</p>
						{/if}
						{#if moveFilesError}
							<p class="file-error">{moveFilesError}</p>
						{/if}
						{#if fileViewMode === 'list'}
							<div class="file-list">
								<div class="file-grid file-header">
									<span class="file-select-cell">
										<input
											type="checkbox"
											class="file-select-box"
											checked={allFilesSelected}
											aria-label={allFilesSelected ? 'Unselect all files' : 'Select all files'}
											on:click|stopPropagation
											on:change={toggleSelectAllFiles}
											disabled={data.inventory.files.length === 0 || isInventoryBusy()}
										/>
									</span>
									<button type="button" class="file-sort-btn" on:click={() => toggleSort('name')}>
										<span>File name</span>
										<span class="sort-indicator" aria-hidden="true">{sortIndicator('name')}</span>
									</button>
									<button type="button" class="file-sort-btn" on:click={() => toggleSort('type')}>
										<span>Type</span>
										<span class="sort-indicator" aria-hidden="true">{sortIndicator('type')}</span>
									</button>
									<button type="button" class="file-sort-btn" on:click={() => toggleSort('size')}>
										<span>Size</span>
										<span class="sort-indicator" aria-hidden="true">{sortIndicator('size')}</span>
									</button>
									<button type="button" class="file-sort-btn" on:click={() => toggleSort('modified')}>
										<span>Date modified</span>
										<span class="sort-indicator" aria-hidden="true">{sortIndicator('modified')}</span>
									</button>
									<span></span>
								</div>
								{#if data.inventory.error}
									<div class="empty-state">File listing unavailable.</div>
								{:else if filteredSortedFiles.length === 0}
									<div class="empty-state">
										{normalizedInventorySearchQuery ? 'No files match your search.' : 'No files in this location.'}
									</div>
								{:else}
									{#each filteredSortedFiles as file}
										{@const fileType = resolveFileType(file.name, file.extension)}
										{@const badge = getFileBadge(fileType)}
										<div
											class="file-grid file-row file-row-btn"
											class:selected={selectedFileNames.has(file.name) || previewSelectedFileName === file.name}
											class:dragging={isFileBeingDragged(file)}
											role="button"
											tabindex="0"
											draggable={!isInventoryBusy()}
											on:pointerenter={playHoverSfx}
											on:focus={playHoverSfx}
											on:click={() => onFileRowClick(file)}
											on:keydown={(event) => onFileRowKeydown(event, file)}
											on:dragstart={(event) => onFileDragStart(event, file)}
											on:dragend={onFileDragEnd}
											aria-label={`Select or open ${file.name}`}
										>
											<span class="file-select-cell">
												<input
													type="checkbox"
													class="file-select-box"
													checked={selectedFileNames.has(file.name)}
													aria-label={`Select ${file.name}`}
													on:click|stopPropagation
													on:change={(event) => onFileSelectionChange(event, file.name)}
													disabled={isInventoryBusy()}
												/>
											</span>
											<span class="file-name">
												<span class={`file-thumb ${badge.tone}`} aria-hidden="true">{badge.label}</span>
												<span class="file-name-text">{file.name}</span>
											</span>
											<span class="file-type">{fileType.toUpperCase()}</span>
											<span class="file-size">{formatSize(file.size)}</span>
											<span class="file-modified">{formatModified(file.modified, file.modifiedTs)}</span>
											<button
												type="button"
												class="file-open-pill"
												on:pointerenter={playHoverSfx}
												on:focus={playHoverSfx}
												on:click={(event) => openFileActionDialog(event, file)}
												aria-label={`Open menu for ${file.name}`}
											>
												Menu
											</button>
										</div>
									{/each}
								{/if}
							</div>
						{:else}
							{#if data.inventory.error}
								<div class="empty-state">File listing unavailable.</div>
							{:else if filteredSortedFiles.length === 0}
								<div class="empty-state">
									{normalizedInventorySearchQuery ? 'No files match your search.' : 'No files in this location.'}
								</div>
							{:else}
								<div class="file-thumb-grid">
									{#each filteredSortedFiles as file}
										{@const fileType = resolveFileType(file.name, file.extension)}
										{@const badge = getFileBadge(fileType)}
										<button
											type="button"
											class="file-thumb-card"
											class:selected={selectedFileNames.has(file.name) || previewSelectedFileName === file.name}
											on:pointerenter={playHoverSfx}
											on:focus={playHoverSfx}
											on:click={() => onFileRowClick(file)}
											aria-label={`Select or open ${file.name}`}
										>
											<div class="file-thumb-card-preview">
												{#if IMAGE_TYPES.has(fileType)}
													<img src={toThumbnailUrl(file.href)} alt="" loading="lazy" />
												{:else}
													<span class={`file-thumb ${badge.tone}`}>{badge.label}</span>
												{/if}
											</div>
											<p class="file-thumb-card-name">{file.name}</p>
										</button>
									{/each}
								</div>
							{/if}
						{/if}
					</div>
				</div>
			{:else}
				<div class="forge-wrap">
					<div class="forge-panel">
						<div class="section-title">Forge Uploads</div>
						<div
							class="forge-drop-area"
							class:active={forgeDragActive}
							class:disabled={!forgeUploadsEnabled || forgePreparing}
							role="region"
							aria-label="Drop files to upload"
							on:dragenter={onForgeDragEnter}
							on:dragover={onForgeDragOver}
							on:dragleave={onForgeDragLeave}
							on:drop={onForgeDrop}
						>
							<input
								bind:this={forgeFileInput}
								type="file"
								multiple
								class="forge-file-input"
								disabled={!forgeUploadsEnabled || forgePreparing}
								on:change={onForgeFileInputChange}
							/>
							<input
								bind:this={forgeFolderInput}
								type="file"
								multiple
								class="forge-file-input"
								disabled={!forgeUploadsEnabled || forgePreparing}
								use:enableDirectoryPicker
								on:change={onForgeFolderInputChange}
							/>
							<p class="forge-drop-title">
								{!forgeUploadsEnabled
									? 'Forge is offline'
									: forgePreparing
										? 'Preparing uploads...'
										: 'Drop files or folders to forge'}
							</p>
							<p class="forge-drop-copy">
								{!forgeUploadsEnabled
									? 'Upload target is unavailable. Check Copyparty config.'
									: forgePreparing
										? forgePreparationLabel
										: 'Browse folders below, then drop files/folders here or use File Grabber.'}
							</p>
							<div class="forge-folder-nav">
								<p class="forge-target-path">Target path: {formatPathLabel(data.inventory.currentPath)}</p>
								<form class="folder-create forge-folder-create" on:submit|preventDefault={onCreateFolderSubmit}>
									<input
										type="text"
										bind:value={newFolderName}
										placeholder="new-folder"
										aria-label="New folder name for forge target"
										disabled={newFolderBusy}
										spellcheck="false"
									/>
									<button
										type="submit"
										on:pointerenter={playHoverSfx}
										on:focus={playHoverSfx}
										disabled={newFolderBusy}
									>
										Create Folder
									</button>
								</form>
								{#if newFolderError}
									<p class="forge-folder-error">{newFolderError}</p>
								{/if}
								<div class="forge-folder-grid">
									{#if data.inventory.parentPath}
										<a
											class="forge-folder-item parent"
											href={toPathHref(data.inventory.parentPath)}
											on:pointerenter={playHoverSfx}
											on:focus={playHoverSfx}
											on:click={playFolderClickSfx}
										>
											..
										</a>
									{/if}

									{#if data.inventory.error}
										<div class="empty-state">Folder listing unavailable.</div>
									{:else if filteredDirectories.length === 0}
										<div class="empty-state">
											{normalizedInventorySearchQuery ? 'No folders match your search.' : 'No folders in this location.'}
										</div>
									{:else}
										{#each filteredDirectories as folder}
											<a
												class="forge-folder-item"
												href={toPathHref(folder.nextPath)}
												on:pointerenter={playHoverSfx}
												on:focus={playHoverSfx}
												on:click={playFolderClickSfx}
											>
												{folder.name}
											</a>
										{/each}
									{/if}
								</div>
							</div>
							<div class="forge-grabber-row">
								<button
									type="button"
									class="forge-grabber-btn"
									on:pointerenter={playHoverSfx}
									on:focus={playHoverSfx}
									on:click={openForgePicker}
									disabled={!forgeUploadsEnabled || forgePreparing}
								>
									File Grabber
								</button>
								<button
									type="button"
									class="forge-grabber-btn forge-grabber-btn--alt"
									on:pointerenter={playHoverSfx}
									on:focus={playHoverSfx}
									on:click={openForgeFolderPicker}
									disabled={!forgeUploadsEnabled || forgePreparing}
								>
									Folder Grabber
								</button>
							</div>
							{#if forgePreparing}
								<div class="forge-prep-status" role="status" aria-live="polite">
									<p class="forge-prep-copy">{forgePreparationLabel || 'Preparing uploads...'}</p>
									<div class="forge-progress forge-progress-prep">
										<span style={`width: ${forgePreparationProgress}%;`}></span>
									</div>
								</div>
							{:else if activeTransferCount > 0}
								<p class="forge-prep-copy" role="status" aria-live="polite">
									Uploading {activeTransferCount} file{activeTransferCount === 1 ? '' : 's'}...
								</p>
							{/if}
						</div>
						{#if forgeDropError}
							<p class="forge-error">{forgeDropError}</p>
						{/if}
					</div>

					<div class="forge-drawer" class:open={uploadDrawerOpen}>
						<button
							type="button"
							class="forge-drawer-toggle"
							on:pointerenter={playHoverSfx}
							on:focus={playHoverSfx}
							on:click={toggleUploadDrawer}
						>
							<span>Upload Logs</span>
							<span>{activeTransferCount}</span>
						</button>
						{#if uploadDrawerOpen}
							<div class="forge-drawer-body">
								<div class="forge-log-toolbar">
									<button
										type="button"
										class="forge-clear-btn"
										on:pointerenter={playHoverSfx}
										on:focus={playHoverSfx}
										on:click={clearFinishedTransfers}
									>
										Clear Finished
									</button>
								</div>
								{#if transferItems.length === 0}
									<div class="empty-state">No uploads yet.</div>
								{:else}
									<div class="forge-log-list">
										{#each visibleTransferItems as item (item.id)}
											<article
												class="forge-log-item"
												class:status-error={item.status === 'error'}
												class:status-complete={item.status === 'complete'}
											>
												<div class="forge-log-top">
													<strong>{item.name}</strong>
													<span>{item.progress}%</span>
												</div>
												<div class="forge-log-meta">
													<span>{formatSize(item.loaded)} / {formatSize(item.size)}</span>
													<span class="forge-status">{item.status}</span>
												</div>
												<div class="forge-progress">
													<span style={`width: ${item.progress}%;`}></span>
												</div>
												{#if item.error}
													<p class="forge-log-error">{item.error}</p>
												{/if}
												<div class="forge-log-actions">
													{#if isTransferActive(item.status)}
														<button
															type="button"
															class="forge-log-btn"
															on:pointerenter={playHoverSfx}
															on:focus={playHoverSfx}
															on:click={() => cancelTransfer(item.id)}
														>
															Cancel
														</button>
													{/if}
													{#if item.status === 'complete' || item.status === 'error'}
														<button
															type="button"
															class="forge-log-btn"
															on:pointerenter={playHoverSfx}
															on:focus={playHoverSfx}
															on:click={() => dismissTransfer(item.id)}
														>
															Dismiss
														</button>
													{/if}
												</div>
											</article>
										{/each}
										{#if hiddenTransferItemCount > 0}
											<p class="forge-log-hidden">
												Showing latest {visibleTransferItems.length} entries. {hiddenTransferItemCount} more
												queued/history item{hiddenTransferItemCount === 1 ? '' : 's'} hidden.
											</p>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</main>
	</div>

	<FileViewerModal
		open={viewerOpen}
		playHoverSfx={playHoverSfx}
		playMenuItemSfx={playMenuItemSfx}
		canGoPrevious={canGoToPreviousFile}
		canGoNext={canGoToNextFile}
		file={
			activeFile
				? {
						name: activeFile.name,
						type: activeFile.type,
						sizeLabel: formatSize(activeFile.sizeBytes),
						modified: activeFile.modified,
						href: activeFile.href
					}
				: null
		}
		on:close={closeFileViewer}
		on:previous={() => goToViewerSiblingFile(-1)}
		on:next={() => goToViewerSiblingFile(1)}
	/>

	<FileActionDialog
		open={fileActionOpen}
		busy={fileActionBusy}
		error={fileActionError}
		playHoverSfx={playHoverSfx}
		playMenuItemSfx={playMenuItemSfx}
		file={
			fileActionFile
				? {
						name: fileActionFile.name,
						type: resolveFileType(fileActionFile.name, fileActionFile.extension),
						sizeLabel: formatSize(fileActionFile.size),
						modified: formatModified(fileActionFile.modified, fileActionFile.modifiedTs),
						href: fileActionFile.href,
						path: joinInventoryPath(fileActionFile.name),
						raw: {
							name: fileActionFile.name,
							extension: fileActionFile.extension,
							size: fileActionFile.size,
							modified: fileActionFile.modified,
							modifiedTs: fileActionFile.modifiedTs,
							href: fileActionFile.href,
							currentPath: data.inventory.currentPath
						}
					}
				: null
		}
		on:close={closeFileActionDialog}
		on:rename={onRenameFile}
		on:delete={onDeleteFile}
	/>

	<UploadConflictDialog
		open={uploadConflictOpen}
		targetPath={data.inventory.currentPath}
		conflicts={uploadConflictItems}
		playHoverSfx={playHoverSfx}
		playMenuItemSfx={playMenuItemSfx}
		on:close={closeUploadConflictDialog}
		on:resolve={onResolveUploadConflict}
	/>
</div>

<style>
	:global(body) {
		margin: 0;
	}

	.app-shell {
		--cc-bg-dark: #2f3339;
		--cc-bg-darker: #1b1e24;
		--cc-text-primary: rgba(246, 248, 252, 0.94);
		--cc-text-secondary: rgba(205, 211, 220, 0.73);
		--cc-accent-yellow: #faee3a;
		--cc-accent-yellow-soft: rgba(250, 238, 58, 0.16);
		--cc-glass-border: rgba(145, 152, 163, 0.4);
		--cc-panel-border-soft: rgba(160, 168, 180, 0.32);
		--cc-font-sans: 'Inter', system-ui, -apple-system, sans-serif;
		--cc-font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
		--glass-border: var(--cc-glass-border);
		--glass-hover: var(--cc-accent-yellow-soft);
		position: relative;
		min-height: 100vh;
		min-height: 100dvh;
		padding: 1rem;
		background:
			radial-gradient(circle at 20% 16%, rgba(255, 255, 255, 0.08), transparent 44%),
			radial-gradient(circle at 82% 84%, rgba(95, 103, 114, 0.26), transparent 40%),
			linear-gradient(155deg, #8d939c 0%, #747a83 56%, #676d75 100%);
		color: var(--cc-text-primary);
		font-family: var(--cc-font-sans);
		overflow: hidden;
		isolation: isolate;
	}

	.app-shell::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image:
			repeating-linear-gradient(
				0deg,
				transparent,
				transparent 78px,
				rgba(93, 99, 109, 0.2) 78px,
				rgba(93, 99, 109, 0.2) 79px
			),
			repeating-linear-gradient(
				90deg,
				transparent,
				transparent 78px,
				rgba(93, 99, 109, 0.18) 78px,
				rgba(93, 99, 109, 0.18) 79px
			),
			repeating-linear-gradient(
				32deg,
				transparent,
				transparent 146px,
				rgba(118, 126, 136, 0.14) 146px,
				rgba(118, 126, 136, 0.14) 147px
			);
		pointer-events: none;
		opacity: 0.7;
		z-index: -2;
	}

	.app-shell::after {
		content: '';
		position: absolute;
		inset: 0;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(40, 45, 52, 0.22) 100%),
			radial-gradient(circle at 50% 12%, rgba(255, 255, 255, 0.08), transparent 36%);
		pointer-events: none;
		z-index: -1;
	}

	.two-col {
		position: relative;
		z-index: 1;
		height: calc(100vh - 2rem);
		height: calc(100dvh - 2rem);
		display: grid;
		grid-template-columns: minmax(240px, 1fr) minmax(0, 5fr);
		gap: 0.8rem;
		min-height: 0;
	}

	aside {
		display: grid;
		grid-template-rows: auto 1fr auto;
		gap: 1rem;
		min-height: 0;
		padding: 0.9rem;
		border: 1px solid var(--glass-border);
		background:
			repeating-linear-gradient(
				-30deg,
				rgba(255, 255, 255, 0.03),
				rgba(255, 255, 255, 0.03) 2px,
				transparent 2px,
				transparent 9px
			),
			linear-gradient(145deg, rgba(43, 43, 43, 0.94) 0%, rgba(21, 21, 21, 0.93) 100%);
		backdrop-filter: blur(10px);
		clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%);
		box-shadow: 0 12px 28px rgba(0, 0, 0, 0.26);
	}

	.sidebar-top {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding-bottom: 0.7rem;
		border-bottom: 1px solid var(--cc-panel-border-soft);
	}

	.brand-title {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 800;
		line-height: 1.2;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.brand-line {
		margin: 0;
		font-size: 0.64rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--cc-text-secondary);
	}

	.status-warning {
		margin: 0.35rem 0 0;
		padding: 0.36rem 0.45rem;
		border: 1px solid rgba(250, 238, 58, 0.44);
		background: rgba(250, 238, 58, 0.12);
		font-size: 0.61rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(245, 248, 255, 0.95);
	}

	.sidebar-tabs-wrap {
		display: grid;
		gap: 0.55rem;
		align-content: start;
	}

	.sidebar-tabs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
	}

	.sidebar-tab-btn {
		height: 34px;
		border: 1px solid rgba(160, 168, 180, 0.46);
		background: rgba(255, 255, 255, 0.04);
		color: rgba(238, 241, 247, 0.85);
		font-size: 0.63rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		cursor: pointer;
		transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
	}

	.sidebar-tab-btn:hover,
	.sidebar-tab-btn:focus-visible {
		border-color: rgba(250, 238, 58, 0.7);
		background: rgba(250, 238, 58, 0.16);
		color: rgba(248, 250, 255, 0.95);
	}

	.sidebar-tab-btn.active {
		border-color: rgba(250, 238, 58, 0.86);
		background: rgba(250, 238, 58, 0.24);
		color: rgba(248, 250, 255, 0.98);
	}

	.sidebar-search {
		display: grid;
		gap: 0.3rem;
	}

	.sidebar-search-label {
		font-size: 0.56rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--cc-text-secondary);
	}

	.sidebar-search-input {
		height: 30px;
		width: 100%;
		border: 1px solid rgba(160, 168, 180, 0.58);
		background: rgba(10, 10, 10, 0.34);
		color: var(--cc-text-primary);
		padding: 0 0.52rem;
		font-size: 0.62rem;
		letter-spacing: 0.06em;
	}

	.sidebar-search-input::placeholder {
		color: var(--cc-text-secondary);
	}

	.sidebar-search-input:focus-visible {
		outline: 1px solid rgba(250, 238, 58, 0.84);
		outline-offset: 1px;
		border-color: rgba(250, 238, 58, 0.74);
	}

	.sidebar-bottom-panel {
		display: flex;
		flex-direction: column;
		gap: 0.32rem;
		padding-top: 0.35rem;
		border-top: 1px solid var(--cc-panel-border-soft);
	}

	main {
		height: 100%;
		min-height: 0;
	}

	.main-content {
		height: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}

	.main-content.folders-expanded .folder-div {
		flex: 5;
	}

	.main-content.folders-expanded .file-div {
		flex: 1.25;
	}

	.folder-div,
	.file-div {
		position: relative;
		min-height: 0;
		overflow: auto;
		padding: 0.8rem 0.95rem;
		border: 1px solid var(--glass-border);
		backdrop-filter: blur(8px);
		background:
			repeating-linear-gradient(
				-30deg,
				rgba(255, 255, 255, 0.02),
				rgba(255, 255, 255, 0.02) 2px,
				transparent 2px,
				transparent 8px
			),
			linear-gradient(145deg, rgba(39, 39, 39, 0.94) 0%, rgba(14, 14, 14, 0.93) 100%);
		clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px);
		transition: border-color 0.2s ease, box-shadow 0.2s ease;
	}

	.folder-div:hover,
	.file-div:hover {
		border-color: rgba(250, 238, 58, 0.58);
		box-shadow: inset 0 0 0 1px rgba(250, 238, 58, 0.2);
	}

	.folder-div {
		flex: 1.25;
	}

	.file-div {
		flex: 5;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin: 0 0 0.8rem;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--cc-text-secondary);
	}

	.section-title-row {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
	}

	.section-title::before {
		content: '';
		width: 8px;
		height: 8px;
		background: var(--cc-accent-yellow);
		border-radius: 1px;
		box-shadow: 0 0 12px rgba(250, 238, 58, 0.35);
	}

	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
		margin-bottom: 0.78rem;
	}

	.section-head .section-title {
		margin: 0;
	}

	.section-expand-btn {
		width: 24px;
		height: 24px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 1px solid rgba(160, 168, 180, 0.58);
		background: rgba(255, 255, 255, 0.05);
		color: var(--cc-text-secondary);
		font-size: 0.68rem;
		font-weight: 800;
		line-height: 1;
		cursor: pointer;
		transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
	}

	.section-expand-btn:hover,
	.section-expand-btn:focus-visible {
		border-color: rgba(250, 238, 58, 0.74);
		background: rgba(250, 238, 58, 0.16);
		color: var(--cc-text-primary);
	}

	.section-expand-btn:focus-visible {
		outline: 1px solid rgba(250, 238, 58, 0.88);
		outline-offset: 1px;
	}

	.section-expand-btn.active {
		border-color: rgba(250, 238, 58, 0.82);
		background: rgba(250, 238, 58, 0.2);
		color: var(--cc-accent-yellow);
	}

	.folder-create {
		display: inline-flex;
		align-items: center;
		gap: 0.38rem;
	}

	.folder-create input {
		width: 150px;
		height: 28px;
		border: 1px solid rgba(160, 168, 180, 0.58);
		background: rgba(10, 10, 10, 0.34);
		color: var(--cc-text-primary);
		padding: 0 0.46rem;
		font-size: 0.64rem;
		letter-spacing: 0.06em;
	}

	.folder-create button {
		height: 28px;
		border: 1px solid rgba(160, 168, 180, 0.62);
		background: rgba(255, 255, 255, 0.08);
		color: var(--cc-text-primary);
		padding: 0 0.56rem;
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.folder-create button:hover:enabled,
	.folder-create button:focus-visible:enabled {
		border-color: rgba(250, 238, 58, 0.78);
		background: rgba(250, 238, 58, 0.18);
	}

	.folder-create button:disabled {
		cursor: default;
		opacity: 0.45;
	}

	.folder-error {
		margin: 0 0 0.6rem;
		font-size: 0.62rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: rgba(241, 174, 174, 0.95);
	}

	.folder-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.62rem;
	}

	.folder-item-shell {
		position: relative;
	}

	.folder-item {
		display: flex;
		flex-direction: column;
		gap: 0.28rem;
		align-items: flex-start;
		min-height: 76px;
		padding: 0.72rem 0.74rem;
		border: 1px solid var(--cc-panel-border-soft);
		background: linear-gradient(145deg, rgba(55, 55, 55, 0.38) 0%, rgba(24, 24, 24, 0.44) 100%);
		color: var(--cc-text-primary);
		cursor: pointer;
		clip-path: polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px);
		transition: border-color 0.2s ease, transform 0.2s ease, background 0.2s ease;
	}

	.folder-item-link {
		text-decoration: none;
	}

	.folder-item-shell .folder-item {
		padding-right: 3.4rem;
	}

	.folder-delete-btn {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		height: 24px;
		min-width: 34px;
		padding: 0 0.38rem;
		border: 1px solid rgba(241, 129, 129, 0.72);
		background: rgba(241, 129, 129, 0.16);
		color: rgba(250, 236, 236, 0.94);
		font-size: 0.54rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.folder-delete-btn:hover:enabled,
	.folder-delete-btn:focus-visible:enabled {
		border-color: rgba(241, 129, 129, 0.9);
		background: rgba(241, 129, 129, 0.24);
	}

	.folder-delete-btn:disabled {
		cursor: default;
		opacity: 0.5;
	}

	.parent-folder {
		border-style: dashed;
	}

	.folder-item:hover {
		border-color: rgba(250, 238, 58, 0.74);
		background: linear-gradient(145deg, rgba(250, 238, 58, 0.18) 0%, rgba(250, 238, 58, 0.1) 100%);
		transform: translateY(-1px);
	}

	.folder-item.drop-target,
	.folder-item-shell.drop-target .folder-item {
		border-color: rgba(122, 219, 156, 0.84);
		background: linear-gradient(145deg, rgba(122, 219, 156, 0.22) 0%, rgba(122, 219, 156, 0.12) 100%);
		box-shadow: inset 0 0 0 1px rgba(122, 219, 156, 0.38);
	}

	.folder-item.drop-disabled,
	.folder-item-shell.drop-disabled .folder-item {
		cursor: progress;
	}

	.folder-name {
		font-size: 0.82rem;
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	.folder-meta {
		font-size: 0.66rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cc-text-secondary);
	}

	.empty-state {
		min-height: 86px;
		display: grid;
		place-items: center;
		padding: 0.7rem;
		border: 1px dashed rgba(166, 174, 184, 0.5);
		background: rgba(13, 13, 13, 0.3);
		color: var(--cc-text-secondary);
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		text-align: center;
	}

	.folder-grid:empty,
	.file-list:empty {
		min-height: 110px;
		display: grid;
		place-items: center;
		border: 1px dashed rgba(166, 174, 184, 0.5);
		background: rgba(13, 13, 13, 0.32);
	}

	.folder-grid:empty::before,
	.file-list:empty::before {
		font-size: 0.68rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--cc-text-secondary);
	}

	.folder-grid:empty::before {
		content: 'Awaiting Folder Feed';
	}

	.file-list:empty::before {
		content: 'Awaiting File Telemetry';
	}

	.file-list {
		display: flex;
		flex-direction: column;
		gap: 0.32rem;
	}

	.file-selection-tools {
		display: inline-flex;
		align-items: center;
		gap: 0.42rem;
	}

	.sidebar-file-selection-tools {
		display: grid;
		gap: 0.45rem;
		margin-top: 0.45rem;
		padding-top: 0.55rem;
		border-top: 1px solid var(--cc-panel-border-soft);
	}

	.sidebar-file-selection-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.42rem;
	}

	.sidebar-file-selection-actions .file-selection-btn {
		width: 100%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.sidebar-delete-selected-btn {
		grid-column: 1 / -1;
	}

	.file-selection-count {
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cc-text-secondary);
	}

	.file-selection-btn {
		height: 26px;
		border: 1px solid rgba(166, 174, 184, 0.58);
		background: rgba(255, 255, 255, 0.08);
		color: var(--cc-text-primary);
		padding: 0 0.52rem;
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.file-selection-btn:hover:enabled,
	.file-selection-btn:focus-visible:enabled {
		border-color: rgba(250, 238, 58, 0.74);
		background: rgba(250, 238, 58, 0.18);
	}

	.file-selection-btn:disabled {
		cursor: default;
		opacity: 0.45;
	}

	.file-selection-btn--danger {
		border-color: rgba(241, 129, 129, 0.72);
		background: rgba(241, 129, 129, 0.16);
	}

	.file-selection-btn--danger:hover:enabled,
	.file-selection-btn--danger:focus-visible:enabled {
		border-color: rgba(241, 129, 129, 0.9);
		background: rgba(241, 129, 129, 0.24);
	}

	.file-move-hint {
		margin: 0 0 0.65rem;
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cc-text-secondary);
	}

	.file-error {
		margin: 0 0 0.6rem;
		font-size: 0.62rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: rgba(241, 174, 174, 0.95);
	}

	.file-grid {
		display: grid;
		grid-template-columns: 30px minmax(0, 2fr) 0.7fr 0.9fr 1fr 42px;
		column-gap: 0.72rem;
		align-items: center;
	}

	.file-select-cell {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.file-select-box {
		width: 14px;
		height: 14px;
		margin: 0;
		accent-color: var(--cc-accent-yellow);
		cursor: pointer;
	}

	.file-select-box:disabled {
		cursor: default;
		opacity: 0.45;
	}

	.file-header {
		padding: 0.28rem 0.45rem 0.52rem;
		border-bottom: 1px solid var(--cc-panel-border-soft);
		font-size: 0.64rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--cc-text-secondary);
	}

	.file-sort-btn {
		width: 100%;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		justify-content: flex-start;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		letter-spacing: inherit;
		text-transform: inherit;
		cursor: pointer;
		text-decoration: none;
	}

	.file-sort-btn:hover {
		color: var(--cc-text-primary);
	}

	.file-sort-btn:focus-visible {
		outline: 1px solid rgba(250, 238, 58, 0.84);
		outline-offset: 2px;
		border-radius: 2px;
	}

	.sort-indicator {
		width: 0.78rem;
		display: inline-flex;
		justify-content: center;
		color: rgba(250, 238, 58, 0.88);
		font-size: 0.58rem;
		line-height: 1;
	}

	.file-row {
		min-height: 46px;
		padding: 0.5rem 0.45rem;
		border: 1px solid var(--cc-panel-border-soft);
		background: rgba(255, 255, 255, 0.035);
		transition: border-color 0.2s ease, background 0.2s ease;
	}

	.file-row-btn {
		width: 100%;
		text-align: left;
		cursor: pointer;
		color: inherit;
		font: inherit;
	}

	.file-row:hover {
		border-color: rgba(250, 238, 58, 0.68);
		background: rgba(250, 238, 58, 0.14);
	}

	.file-row.selected {
		border-color: rgba(250, 238, 58, 0.8);
		background: rgba(250, 238, 58, 0.2);
	}

	.file-row.dragging {
		opacity: 0.55;
	}

	.file-row-btn:focus-visible {
		outline: 1px solid rgba(250, 238, 58, 0.84);
		outline-offset: 1px;
	}

	.file-name {
		min-width: 0;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.84rem;
	}

	.file-name-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-thumb {
		flex: 0 0 auto;
		height: 1.2rem;
		min-width: 1.86rem;
		padding: 0 0.28rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		border: 1px solid rgba(167, 176, 190, 0.52);
		background: rgba(255, 255, 255, 0.08);
		color: rgba(245, 248, 252, 0.92);
		font-size: 0.53rem;
		font-weight: 800;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		line-height: 1;
	}

	.file-view-toggle {
		display: flex;
		border: 1px solid var(--cc-panel-border-soft);
		border-radius: 3px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.file-view-toggle button {
		padding: 0.2rem 0.65rem;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		border: 0;
		background: none;
		color: var(--cc-text-secondary);
		cursor: pointer;
		font-family: inherit;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.file-view-toggle button + button {
		border-left: 1px solid var(--cc-panel-border-soft);
	}

	.file-view-toggle button.active {
		background: rgba(250, 238, 58, 0.16);
		color: var(--cc-accent-yellow);
	}

	.file-view-toggle button:not(.active):hover {
		background: rgba(255, 255, 255, 0.06);
		color: var(--cc-text-primary);
	}

	.file-thumb-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 0.5rem;
		padding: 0.2rem 0;
	}

	.file-thumb-card {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--cc-panel-border-soft);
		background: rgba(255, 255, 255, 0.035);
		border-radius: 4px;
		overflow: hidden;
		cursor: pointer;
		text-align: left;
		color: inherit;
		font: inherit;
		transition: border-color 0.2s ease, background 0.2s ease;
		min-width: 0;
	}

	.file-thumb-card:hover {
		border-color: rgba(250, 238, 58, 0.68);
		background: rgba(250, 238, 58, 0.14);
	}

	.file-thumb-card:focus-visible {
		outline: 1px solid rgba(250, 238, 58, 0.84);
		outline-offset: 1px;
	}

	.file-thumb-card.selected {
		border-color: rgba(250, 238, 58, 0.8);
		background: rgba(250, 238, 58, 0.2);
	}

	.file-thumb-card-preview {
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.25);
		overflow: hidden;
	}

	.file-thumb-card-preview img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.file-thumb-card-name {
		padding: 0.32rem 0.45rem;
		font-size: 0.68rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--cc-text-primary);
		border-top: 1px solid var(--cc-panel-border-soft);
		margin: 0;
	}

	.tone-image {
		background: rgba(80, 153, 242, 0.22);
		border-color: rgba(80, 153, 242, 0.56);
	}

	.tone-video {
		background: rgba(245, 136, 63, 0.2);
		border-color: rgba(245, 136, 63, 0.54);
	}

	.tone-audio {
		background: rgba(122, 219, 156, 0.2);
		border-color: rgba(122, 219, 156, 0.54);
	}

	.tone-text {
		background: rgba(183, 194, 214, 0.2);
		border-color: rgba(183, 194, 214, 0.5);
	}

	.tone-code {
		background: rgba(171, 143, 255, 0.2);
		border-color: rgba(171, 143, 255, 0.54);
	}

	.tone-archive {
		background: rgba(247, 214, 90, 0.2);
		border-color: rgba(247, 214, 90, 0.54);
	}

	.tone-other {
		background: rgba(156, 164, 177, 0.2);
		border-color: rgba(156, 164, 177, 0.5);
	}

	.file-type,
	.file-size,
	.file-modified {
		font-size: 0.72rem;
		color: var(--cc-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-open-pill {
		justify-self: end;
		height: 26px;
		min-width: 50px;
		padding: 0 0.56rem;
		border: 1px solid rgba(166, 174, 184, 0.55);
		background: rgba(255, 255, 255, 0.06);
		color: var(--cc-text-primary);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.11em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.file-row:hover .file-open-pill {
		background: rgba(250, 238, 58, 0.24);
		border-color: rgba(250, 238, 58, 0.74);
	}

	.file-open-pill:focus-visible {
		outline: 1px solid rgba(250, 238, 58, 0.88);
		outline-offset: 1px;
	}

	.forge-wrap {
		height: 100%;
		min-height: 0;
		display: grid;
		grid-template-rows: minmax(0, 1fr) auto;
		gap: 0.8rem;
	}

	.forge-panel {
		min-height: 0;
		overflow: auto;
		padding: 0.8rem 0.95rem;
		border: 1px solid var(--glass-border);
		backdrop-filter: blur(8px);
		background:
			repeating-linear-gradient(
				-30deg,
				rgba(255, 255, 255, 0.02),
				rgba(255, 255, 255, 0.02) 2px,
				transparent 2px,
				transparent 8px
			),
			linear-gradient(145deg, rgba(39, 39, 39, 0.94) 0%, rgba(14, 14, 14, 0.93) 100%);
		clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px);
	}

	.forge-drop-area {
		border: 1px dashed rgba(172, 180, 190, 0.55);
		background: rgba(13, 13, 13, 0.48);
		padding: 1.05rem 1rem;
		display: grid;
		justify-items: center;
		gap: 0.58rem;
		text-align: center;
		transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
	}

	.forge-drop-area.active {
		border-color: rgba(250, 238, 58, 0.82);
		background: rgba(250, 238, 58, 0.14);
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
	}

	.forge-drop-area.disabled {
		opacity: 0.6;
	}

	.forge-file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.forge-drop-title {
		margin: 0;
		font-size: 0.83rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.forge-drop-copy {
		margin: 0;
		font-size: 0.66rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cc-text-secondary);
	}

	.forge-prep-status {
		width: min(520px, 100%);
		display: grid;
		gap: 0.34rem;
	}

	.forge-prep-copy {
		margin: 0;
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: rgba(237, 241, 248, 0.92);
	}

	.forge-progress-prep {
		height: 6px;
	}

	.forge-progress-prep > span {
		transition: width 0.18s ease;
	}

	.forge-folder-nav {
		width: min(560px, 100%);
		display: grid;
		gap: 0.5rem;
		justify-items: stretch;
	}

	.forge-folder-create {
		width: 100%;
		justify-content: center;
	}

	.forge-folder-create input {
		width: min(220px, 100%);
	}

	.forge-folder-error {
		margin: 0;
		font-size: 0.62rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: rgba(241, 174, 174, 0.95);
		text-align: center;
	}

	.forge-folder-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
		gap: 0.4rem;
	}

	.forge-folder-item {
		height: 30px;
		padding: 0 0.48rem;
		border: 1px solid rgba(165, 173, 185, 0.58);
		background: rgba(255, 255, 255, 0.06);
		color: var(--cc-text-primary);
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.forge-folder-item.parent {
		border-style: dashed;
	}

	.forge-folder-item:hover,
	.forge-folder-item:focus-visible {
		border-color: rgba(250, 238, 58, 0.78);
		background: rgba(250, 238, 58, 0.2);
	}

	.forge-grabber-btn {
		height: 34px;
		border: 1px solid rgba(250, 238, 58, 0.62);
		background: rgba(250, 238, 58, 0.2);
		color: rgba(247, 249, 255, 0.98);
		font-size: 0.64rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		padding: 0 0.85rem;
		cursor: pointer;
		transition: background 0.2s ease, border-color 0.2s ease;
	}

	.forge-grabber-row {
		display: inline-flex;
		align-items: center;
		gap: 0.42rem;
		flex-wrap: wrap;
		justify-content: center;
	}

	.forge-grabber-btn:hover:not(:disabled),
	.forge-grabber-btn:focus-visible:not(:disabled) {
		background: rgba(250, 238, 58, 0.3);
		border-color: rgba(250, 238, 58, 0.86);
	}

	.forge-grabber-btn--alt {
		border-color: rgba(166, 174, 184, 0.62);
		background: rgba(255, 255, 255, 0.08);
	}

	.forge-grabber-btn--alt:hover:not(:disabled),
	.forge-grabber-btn--alt:focus-visible:not(:disabled) {
		background: rgba(250, 238, 58, 0.22);
		border-color: rgba(250, 238, 58, 0.78);
	}

	.forge-grabber-btn:disabled {
		cursor: default;
		opacity: 0.45;
	}

	.forge-target-path {
		margin: 0;
		font-size: 0.64rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--cc-text-secondary);
	}

	.forge-error {
		margin: 0.6rem 0 0;
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(241, 174, 174, 0.95);
	}

	.forge-drawer {
		border: 1px solid var(--glass-border);
		background: linear-gradient(145deg, rgba(35, 35, 35, 0.95) 0%, rgba(17, 17, 17, 0.95) 100%);
		max-height: 72vh;
		overflow: hidden;
	}

	.forge-drawer-toggle {
		width: 100%;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 0.8rem;
		border: 0;
		background: rgba(255, 255, 255, 0.08);
		color: rgba(245, 248, 252, 0.92);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.13em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.forge-drawer-toggle:hover,
	.forge-drawer-toggle:focus-visible {
		background: rgba(250, 238, 58, 0.18);
	}

	.forge-drawer-body {
		padding: 0.7rem 0.75rem 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		max-height: calc(72vh - 44px);
	}

	.forge-log-toolbar {
		display: flex;
		justify-content: flex-end;
	}

	.forge-clear-btn {
		height: 28px;
		border: 1px solid rgba(164, 172, 182, 0.62);
		background: rgba(255, 255, 255, 0.08);
		color: rgba(240, 243, 250, 0.9);
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 0 0.6rem;
		cursor: pointer;
	}

	.forge-clear-btn:hover,
	.forge-clear-btn:focus-visible {
		border-color: rgba(250, 238, 58, 0.74);
		background: rgba(250, 238, 58, 0.18);
	}

	.forge-log-list {
		display: flex;
		flex-direction: column;
		gap: 0.48rem;
		overflow: auto;
	}

	.forge-log-item {
		border: 1px solid rgba(154, 163, 176, 0.48);
		background: rgba(255, 255, 255, 0.04);
		padding: 0.5rem 0.55rem;
		display: flex;
		flex-direction: column;
		gap: 0.34rem;
	}

	.forge-log-item.status-complete {
		border-color: rgba(117, 222, 150, 0.58);
	}

	.forge-log-item.status-error {
		border-color: rgba(241, 140, 140, 0.68);
	}

	.forge-log-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
	}

	.forge-log-top strong {
		min-width: 0;
		font-size: 0.7rem;
		letter-spacing: 0.04em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.forge-log-top span {
		flex: 0 0 auto;
		font-size: 0.64rem;
		font-weight: 700;
		letter-spacing: 0.08em;
	}

	.forge-log-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cc-text-secondary);
	}

	.forge-status {
		font-size: 0.58rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.forge-progress {
		height: 5px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.12);
		overflow: hidden;
	}

	.forge-progress > span {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, rgba(250, 238, 58, 0.9), rgba(53, 184, 101, 0.9));
	}

	.forge-log-hidden {
		margin: 0.1rem 0 0;
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cc-text-secondary);
	}

	.forge-log-error {
		margin: 0;
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(241, 174, 174, 0.95);
	}

	.forge-log-actions {
		display: flex;
		justify-content: flex-end;
	}

	.forge-log-btn {
		height: 24px;
		border: 1px solid rgba(164, 172, 182, 0.62);
		background: rgba(255, 255, 255, 0.08);
		color: rgba(240, 243, 250, 0.9);
		font-size: 0.56rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 0 0.52rem;
		cursor: pointer;
	}

	.forge-log-btn:hover,
	.forge-log-btn:focus-visible {
		border-color: rgba(250, 238, 58, 0.74);
		background: rgba(250, 238, 58, 0.18);
	}

	@media (max-width: 960px) {
		.two-col {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
			height: auto;
			min-height: calc(100dvh - 2rem);
		}

		aside {
			min-height: 220px;
		}

		.main-content {
			min-height: 460px;
		}

		.forge-wrap {
			grid-template-rows: minmax(0, 1fr) auto;
		}

		.section-head {
			flex-direction: column;
			align-items: flex-start;
		}

		.file-selection-tools {
			width: 100%;
			flex-wrap: wrap;
		}

		.sidebar-file-selection-actions {
			grid-template-columns: 1fr;
		}

		.folder-create {
			width: 100%;
		}

		.folder-create input {
			flex: 1;
		}
	}

	@media (max-width: 700px) {
		.file-div {
			padding: 0.7rem 0.72rem;
		}

		.file-grid {
			grid-template-columns: 24px minmax(0, 1fr) minmax(64px, auto) 72px;
			column-gap: 0.45rem;
		}

		.file-header .file-sort-btn:nth-of-type(2),
		.file-header .file-sort-btn:nth-of-type(4),
		.file-header > span:last-child {
			display: none;
		}

		.file-row .file-type,
		.file-row .file-modified {
			display: none;
		}

		.file-row {
			padding: 0.42rem 0.34rem;
		}

		.file-name {
			gap: 0.3rem;
			font-size: 0.74rem;
		}

		.file-thumb {
			min-width: 1.58rem;
			height: 1.1rem;
			font-size: 0.48rem;
			letter-spacing: 0.07em;
		}

		.file-size {
			font-size: 0.66rem;
		}

		.file-open-pill {
			min-width: 46px;
			height: 24px;
			padding: 0 0.36rem;
			font-size: 0.56rem;
			letter-spacing: 0.08em;
		}
	}
</style>
