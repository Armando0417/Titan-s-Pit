<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	type ViewerFile = {
		name: string;
		type: string;
		sizeLabel: string;
		modified: string;
		href: string;
	};

	export let open = false;
	export let file: ViewerFile | null = null;
	export let playHoverSfx: (() => void) | null = null;
	export let playMenuItemSfx: (() => void) | null = null;
	export let canGoPrevious = false;
	export let canGoNext = false;

	const dispatch = createEventDispatcher<{ close: void; previous: void; next: void }>();

	const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp']);
	const VIDEO_EXTENSIONS = new Set(['mp4', 'mkv', 'webm', 'mov', 'm4v', 'avi', 'ogv', 'ogg']);
	const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'flac', 'aac', 'opus', 'ogg']);

	$: normalizedType = file?.type.trim().toLowerCase() ?? '';
	$: isImage = IMAGE_EXTENSIONS.has(normalizedType);
	$: isVideo = VIDEO_EXTENSIONS.has(normalizedType);
	$: isAudio = AUDIO_EXTENSIONS.has(normalizedType);
	$: videoMime = resolveVideoMime(normalizedType);
	$: downloadHref = file ? toDownloadHref(file.href) : '';

	function closeViewer() {
		dispatch('close');
	}

	function onModalButtonHover() {
		playHoverSfx?.();
	}

	function onModalMenuAction() {
		playMenuItemSfx?.();
	}

	function onCloseButtonClick() {
		onModalMenuAction();
		closeViewer();
	}

	function onPreviousButtonClick() {
		if (!canGoPrevious) {
			return;
		}
		onModalMenuAction();
		dispatch('previous');
	}

	function onNextButtonClick() {
		if (!canGoNext) {
			return;
		}
		onModalMenuAction();
		dispatch('next');
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (!open) {
			return;
		}
		if (event.key === 'Escape') {
			closeViewer();
			return;
		}
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			onPreviousButtonClick();
			return;
		}
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			onNextButtonClick();
		}
	}

	function toDownloadHref(href: string): string {
		try {
			const url = new URL(href);
			if (!url.searchParams.has('dl')) {
				url.searchParams.set('dl', '');
			}
			return url.toString();
		} catch {
			return href;
		}
	}

	function resolveVideoMime(type: string): string | null {
		if (type === 'mp4' || type === 'm4v') {
			return 'video/mp4';
		}
		if (type === 'webm') {
			return 'video/webm';
		}
		if (type === 'ogv' || type === 'ogg') {
			return 'video/ogg';
		}
		// Keep null for containers/codecs with inconsistent browser support (mkv/avi/mov).
		return null;
	}
</script>

<svelte:window on:keydown={onWindowKeydown} />

{#if open && file}
	<div class="overlay" role="dialog" aria-modal="true" aria-label={`Preview ${file.name}`}>
		<button class="backdrop" type="button" aria-label="Close preview" on:click={closeViewer}></button>

		<div class="viewer">
			<button
				class="nav-arrow nav-arrow-left"
				type="button"
				aria-label="Previous file"
				disabled={!canGoPrevious}
				on:pointerenter={onModalButtonHover}
				on:focus={onModalButtonHover}
				on:click={onPreviousButtonClick}
			>
				&#8249;
			</button>
			<button
				class="nav-arrow nav-arrow-right"
				type="button"
				aria-label="Next file"
				disabled={!canGoNext}
				on:pointerenter={onModalButtonHover}
				on:focus={onModalButtonHover}
				on:click={onNextButtonClick}
			>
				&#8250;
			</button>
			<div class="viewer-header">
				<div class="file-name" title={file.name}>{file.name}</div>
				<div class="viewer-actions">
					<a
						class="action-link"
						href={file.href}
						target="_blank"
						rel="noreferrer"
						on:pointerenter={onModalButtonHover}
						on:focus={onModalButtonHover}
						on:click={onModalMenuAction}
					>
						Open
					</a>
					<a
						class="action-link"
						href={downloadHref}
						download={file.name}
						on:pointerenter={onModalButtonHover}
						on:focus={onModalButtonHover}
						on:click={onModalMenuAction}
					>
						Download
					</a>
					<button
						class="close-btn"
						type="button"
						on:pointerenter={onModalButtonHover}
						on:focus={onModalButtonHover}
						on:click={onCloseButtonClick}
					>
						Close
					</button>
				</div>
			</div>

			<div class="viewer-body">
				{#if isImage}
					<div class="media-stage">
						<img class="preview-image" src={file.href} alt={file.name} />
					</div>
				{:else if isVideo}
					<div class="media-stage">
						<video class="preview-video" controls playsinline preload="auto">
							<source src={file.href} type={videoMime ?? undefined} />
							<track kind="captions" src="/mock-files/placeholder-captions.vtt" srclang="en" />
						</video>
					</div>
				{:else if isAudio}
					<div class="audio-shell">
						<audio class="preview-audio" controls preload="metadata" src={file.href}></audio>
					</div>
				{:else}
					<div class="fallback">
						<p>No inline preview for `{normalizedType || 'file'}`.</p>
						<p>{file.sizeLabel} | {file.modified}</p>
						<a
							class="fallback-link"
							href={file.href}
							target="_blank"
							rel="noreferrer"
							on:pointerenter={onModalButtonHover}
							on:focus={onModalButtonHover}
							on:click={onModalMenuAction}
						>
							Open in new tab
						</a>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 70;
		display: grid;
		place-items: center;
		padding: 0.75rem;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		border: none;
		background: rgba(0, 0, 0, 0.82);
		cursor: zoom-out;
	}

	.viewer {
		position: relative;
		z-index: 1;
		width: min(96vw, 1400px);
		height: min(96dvh, 100%);
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		border-radius: 8px;
		overflow: hidden;
		background: #111;
		border: 1px solid rgba(255, 255, 255, 0.18);
	}

	.viewer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.65rem 0.8rem;
		background: rgba(20, 20, 20, 0.94);
		border-bottom: 1px solid rgba(255, 255, 255, 0.12);
	}

	.nav-arrow {
		position: absolute;
		top: 50%;
		z-index: 3;
		width: 30px;
		height: 30px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid rgba(255, 255, 255, 0.32);
		border-radius: 999px;
		background: rgba(10, 10, 10, 0.72);
		color: rgba(245, 248, 252, 0.94);
		font-size: 1.2rem;
		line-height: 1;
		cursor: pointer;
		transform: translateY(-50%);
	}

	.nav-arrow:hover:not(:disabled) {
		background: rgba(250, 238, 58, 0.22);
		border-color: rgba(250, 238, 58, 0.72);
	}

	.nav-arrow:focus-visible {
		outline: 1px solid rgba(250, 238, 58, 0.88);
		outline-offset: 2px;
	}

	.nav-arrow:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.nav-arrow-left {
		left: 0.6rem;
	}

	.nav-arrow-right {
		right: 0.6rem;
	}

	.file-name {
		min-width: 0;
		font-size: 0.87rem;
		font-weight: 600;
		color: rgba(245, 248, 252, 0.94);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.viewer-actions {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}

	.action-link,
	.close-btn,
	.fallback-link {
		height: 30px;
		padding: 0 0.7rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.08);
		color: rgba(245, 248, 252, 0.94);
		font-size: 0.74rem;
		text-decoration: none;
		cursor: pointer;
	}

	.action-link:hover,
	.close-btn:hover,
	.fallback-link:hover {
		background: rgba(255, 255, 255, 0.16);
	}

	.viewer-body {
		min-height: 0;
		display: grid;
		place-items: center;
		padding: 0.35rem;
		background: #090909;
		overflow: auto;
	}

	.media-stage {
		width: 100%;
		height: 100%;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: auto;
		background: #000;
	}

	.preview-image {
		height: 100%;
		width: auto;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		object-position: center;
		display: block;
		user-select: none;
	}

	.preview-video {
		width: auto;
		height: auto;
		max-width: 100%;
		max-height: 100%;
		min-width: min(520px, 100%);
		display: block;
		background: #000;
	}

	/* Ensure portrait images don't get forced by width on small screens. */
	@media (max-width: 760px) {
		.preview-image {
			height: auto;
			width: auto;
			max-width: 100%;
			max-height: 100%;
		}
	}

	.audio-shell {
		width: min(720px, 100%);
		padding: 1.2rem;
		display: grid;
		place-items: center;
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.05);
	}

	.preview-audio {
		width: min(660px, 100%);
	}

	.fallback {
		max-width: 620px;
		text-align: center;
		display: grid;
		gap: 0.7rem;
		color: rgba(238, 243, 250, 0.9);
		font-size: 0.9rem;
	}

	.fallback p {
		margin: 0;
	}

	@media (max-width: 760px) {
		.overlay {
			padding: 0.4rem;
		}

		.viewer {
			height: min(96dvh, 100%);
		}

		.viewer-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.viewer-actions {
			width: 100%;
			flex-wrap: wrap;
		}
	}
</style>
