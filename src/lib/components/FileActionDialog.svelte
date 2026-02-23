<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	type DialogFile = {
		name: string;
		type: string;
		sizeLabel: string;
		modified: string;
		href: string;
		path: string;
		raw: Record<string, unknown>;
	};

	export let open = false;
	export let file: DialogFile | null = null;
	export let busy = false;
	export let error = '';
	export let playHoverSfx: (() => void) | null = null;
	export let playMenuItemSfx: (() => void) | null = null;

	const dispatch = createEventDispatcher<{
		close: void;
		rename: { nextName: string };
		delete: void;
	}>();

	let renameInput = '';
	let renameSeed = '';
	let downloadHref = '';

	$: {
		if (!open || !file) {
			renameSeed = '';
			renameInput = '';
			downloadHref = '';
		} else if (renameSeed !== file.path) {
			renameSeed = file.path;
			renameInput = file.name;
			downloadHref = toDownloadHref(file.href);
		}
	}

	function onClose() {
		dispatch('close');
	}

	function onRenameSubmit() {
		if (!file || busy) {
			return;
		}

		const nextName = renameInput.trim();
		if (!nextName || nextName === file.name) {
			return;
		}

		playMenuItemSfx?.();
		dispatch('rename', { nextName });
	}

	function onDeleteClick() {
		if (!file || busy) {
			return;
		}

		playMenuItemSfx?.();
		dispatch('delete');
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (!open) {
			return;
		}
		if (event.key === 'Escape') {
			onClose();
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
</script>

<svelte:window on:keydown={onWindowKeydown} />

{#if open && file}
	<div class="overlay" role="dialog" aria-modal="true" aria-label={`File menu for ${file.name}`}>
		<button type="button" class="backdrop" aria-label="Close file menu" on:click={onClose}></button>

		<div class="panel">
			<header class="header">
				<div>
					<strong>File Menu</strong>
					<span>{file.name}</span>
				</div>
				<button
					type="button"
					class="close-btn"
					on:pointerenter={playHoverSfx}
					on:focus={playHoverSfx}
					on:click={onClose}
				>
					Close
				</button>
			</header>

			<section class="meta-grid">
				<div><span>Type</span><strong>{file.type.toUpperCase()}</strong></div>
				<div><span>Size</span><strong>{file.sizeLabel}</strong></div>
				<div><span>Modified</span><strong>{file.modified}</strong></div>
				<div><span>Path</span><strong>{file.path}</strong></div>
			</section>

			<section class="rename-row">
				<label for="rename-file-input">Rename</label>
				<div>
					<input
						id="rename-file-input"
						type="text"
						bind:value={renameInput}
						disabled={busy}
						spellcheck="false"
					/>
					<button
						type="button"
						on:pointerenter={playHoverSfx}
						on:focus={playHoverSfx}
						on:click={onRenameSubmit}
						disabled={busy || renameInput.trim() === '' || renameInput.trim() === file.name}
					>
						Apply
					</button>
				</div>
			</section>

			<section class="raw-wrap">
				<p>Raw Data</p>
				<pre>{JSON.stringify(file.raw, null, 2)}</pre>
			</section>

			{#if error}
				<p class="error-text">{error}</p>
			{/if}

			<footer class="actions">
				<a
					class="action-link"
					href={file.href}
					target="_blank"
					rel="noreferrer"
					on:pointerenter={playHoverSfx}
					on:focus={playHoverSfx}
					on:click={playMenuItemSfx}
				>
					Open
				</a>
				<a
					class="action-link"
					href={downloadHref}
					download={file.name}
					on:pointerenter={playHoverSfx}
					on:focus={playHoverSfx}
					on:click={playMenuItemSfx}
				>
					Download
				</a>
				<button
					type="button"
					class="danger-btn"
					on:pointerenter={playHoverSfx}
					on:focus={playHoverSfx}
					on:click={onDeleteClick}
					disabled={busy}
				>
					Delete
				</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 82;
		display: grid;
		place-items: center;
		padding: 0.8rem;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		background: rgba(0, 0, 0, 0.78);
	}

	.panel {
		position: relative;
		z-index: 1;
		width: min(760px, 94vw);
		max-height: min(90dvh, 880px);
		display: grid;
		grid-template-rows: auto auto auto minmax(0, 1fr) auto auto;
		gap: 0.7rem;
		padding: 0.9rem;
		border: 1px solid rgba(164, 172, 182, 0.56);
		background: linear-gradient(160deg, rgba(35, 35, 35, 0.96) 0%, rgba(16, 16, 16, 0.95) 100%);
		color: rgba(245, 248, 252, 0.94);
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
	}

	.header strong {
		display: block;
		font-size: 0.74rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.header span {
		font-size: 0.66rem;
		letter-spacing: 0.08em;
		opacity: 0.75;
	}

	.close-btn {
		height: 28px;
		border: 1px solid rgba(170, 178, 188, 0.62);
		background: rgba(255, 255, 255, 0.08);
		color: inherit;
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 0 0.55rem;
		cursor: pointer;
	}

	.close-btn:hover,
	.close-btn:focus-visible {
		border-color: rgba(250, 238, 58, 0.78);
		background: rgba(250, 238, 58, 0.18);
	}

	.meta-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.meta-grid div {
		display: flex;
		justify-content: space-between;
		gap: 0.55rem;
		padding: 0.32rem 0.42rem;
		border: 1px solid rgba(158, 166, 176, 0.45);
		background: rgba(255, 255, 255, 0.03);
	}

	.meta-grid span {
		font-size: 0.58rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		opacity: 0.74;
	}

	.meta-grid strong {
		font-size: 0.62rem;
		letter-spacing: 0.07em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.rename-row {
		display: flex;
		flex-direction: column;
		gap: 0.34rem;
	}

	.rename-row label {
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: rgba(205, 211, 220, 0.78);
	}

	.rename-row > div {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.rename-row input {
		flex: 1;
		height: 30px;
		border: 1px solid rgba(160, 168, 180, 0.58);
		background: rgba(0, 0, 0, 0.32);
		color: inherit;
		padding: 0 0.5rem;
		font-size: 0.7rem;
	}

	.rename-row button {
		height: 30px;
		border: 1px solid rgba(170, 178, 188, 0.62);
		background: rgba(255, 255, 255, 0.08);
		color: inherit;
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 0 0.6rem;
		cursor: pointer;
	}

	.rename-row button:hover:enabled,
	.rename-row button:focus-visible:enabled {
		border-color: rgba(250, 238, 58, 0.78);
		background: rgba(250, 238, 58, 0.18);
	}

	.rename-row button:disabled {
		cursor: default;
		opacity: 0.45;
	}

	.raw-wrap {
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.raw-wrap p {
		margin: 0;
		font-size: 0.61rem;
		letter-spacing: 0.11em;
		text-transform: uppercase;
		color: rgba(205, 211, 220, 0.78);
	}

	.raw-wrap pre {
		flex: 1;
		min-height: 180px;
		max-height: min(42dvh, 420px);
		margin: 0;
		padding: 0.6rem;
		border: 1px solid rgba(160, 168, 180, 0.45);
		background: rgba(10, 10, 10, 0.46);
		font-size: 0.63rem;
		line-height: 1.45;
		overflow: auto;
	}

	.error-text {
		margin: 0;
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(241, 174, 174, 0.95);
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.45rem;
	}

	.action-link,
	.danger-btn {
		height: 30px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid rgba(170, 178, 188, 0.62);
		background: rgba(255, 255, 255, 0.08);
		color: inherit;
		padding: 0 0.65rem;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		text-decoration: none;
		cursor: pointer;
	}

	.action-link:hover,
	.action-link:focus-visible,
	.danger-btn:hover:enabled,
	.danger-btn:focus-visible:enabled {
		border-color: rgba(250, 238, 58, 0.78);
		background: rgba(250, 238, 58, 0.18);
	}

	.danger-btn {
		border-color: rgba(241, 140, 140, 0.68);
		color: rgba(248, 224, 224, 0.94);
	}

	.danger-btn:disabled {
		cursor: default;
		opacity: 0.45;
	}

	@media (max-width: 700px) {
		.panel {
			grid-template-rows: auto auto auto minmax(0, 1fr) auto auto;
		}

		.meta-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
