<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	type ConflictItem = {
		name: string;
		size: number;
	};

	type ResolveDetail = {
		strategy: 'rename' | 'replace' | 'skip';
	};

	export let open = false;
	export let targetPath = '/';
	export let conflicts: ConflictItem[] = [];
	export let playHoverSfx: (() => void) | null = null;
	export let playMenuItemSfx: (() => void) | null = null;

	const dispatch = createEventDispatcher<{
		close: void;
		resolve: ResolveDetail;
	}>();

	function closeDialog() {
		dispatch('close');
	}

	function resolveConflict(strategy: ResolveDetail['strategy']) {
		playMenuItemSfx?.();
		dispatch('resolve', { strategy });
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

	function onWindowKeydown(event: KeyboardEvent) {
		if (!open) {
			return;
		}
		if (event.key === 'Escape') {
			closeDialog();
		}
	}
</script>

<svelte:window on:keydown={onWindowKeydown} />

{#if open}
	<div class="overlay" role="dialog" aria-modal="true" aria-label="Resolve upload conflicts">
		<button type="button" class="backdrop" aria-label="Close conflict dialog" on:click={closeDialog}></button>

		<div class="panel">
			<header>
				<strong>Upload Conflicts Detected</strong>
				<p>{conflicts.length} file(s) already exist in `{targetPath}`.</p>
			</header>

			<section class="conflict-list" aria-label="Conflicting files">
				{#each conflicts as item (item.name)}
					<div class="conflict-item">
						<span>{item.name}</span>
						<span>{formatSize(item.size)}</span>
					</div>
				{/each}
			</section>

			<footer class="actions">
				<button
					type="button"
					on:pointerenter={playHoverSfx}
					on:focus={playHoverSfx}
					on:click={() => resolveConflict('rename')}
				>
					Rename Incoming
				</button>
				<button
					type="button"
					on:pointerenter={playHoverSfx}
					on:focus={playHoverSfx}
					on:click={() => resolveConflict('replace')}
				>
					Replace Existing
				</button>
				<button
					type="button"
					on:pointerenter={playHoverSfx}
					on:focus={playHoverSfx}
					on:click={() => resolveConflict('skip')}
				>
					Skip Conflicts
				</button>
				<button
					type="button"
					class="cancel-btn"
					on:pointerenter={playHoverSfx}
					on:focus={playHoverSfx}
					on:click={closeDialog}
				>
					Cancel
				</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 83;
		display: grid;
		place-items: center;
		padding: 0.8rem;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		background: rgba(0, 0, 0, 0.8);
	}

	.panel {
		position: relative;
		z-index: 1;
		width: min(640px, 94vw);
		display: grid;
		grid-template-rows: auto minmax(120px, 1fr) auto;
		gap: 0.7rem;
		padding: 0.9rem;
		border: 1px solid rgba(164, 172, 182, 0.56);
		background: linear-gradient(160deg, rgba(35, 35, 35, 0.96) 0%, rgba(16, 16, 16, 0.95) 100%);
		color: rgba(245, 248, 252, 0.94);
	}

	header strong {
		display: block;
		font-size: 0.75rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	header p {
		margin: 0.28rem 0 0;
		font-size: 0.64rem;
		letter-spacing: 0.08em;
		color: rgba(205, 211, 220, 0.78);
	}

	.conflict-list {
		min-height: 0;
		max-height: min(42dvh, 340px);
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.35rem;
		border: 1px solid rgba(160, 168, 180, 0.45);
		background: rgba(10, 10, 10, 0.42);
	}

	.conflict-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.55rem;
		padding: 0.28rem 0.4rem;
		border: 1px solid rgba(160, 168, 180, 0.38);
		background: rgba(255, 255, 255, 0.03);
		font-size: 0.63rem;
		letter-spacing: 0.07em;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.45rem;
	}

	.actions button {
		height: 30px;
		border: 1px solid rgba(170, 178, 188, 0.62);
		background: rgba(255, 255, 255, 0.08);
		color: inherit;
		padding: 0 0.65rem;
		font-size: 0.61rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.actions button:hover,
	.actions button:focus-visible {
		border-color: rgba(250, 238, 58, 0.78);
		background: rgba(250, 238, 58, 0.18);
	}

	.actions .cancel-btn {
		border-color: rgba(241, 140, 140, 0.68);
	}
</style>
