<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	type UploadSummary = {
		total: number;
		completed: number;
		failed: number;
		canceled: number;
	};

	export let open = false;
	export let summary: UploadSummary = {
		total: 0,
		completed: 0,
		failed: 0,
		canceled: 0
	};
	export let playHoverSfx: (() => void) | null = null;

	const dispatch = createEventDispatcher<{
		close: void;
	}>();

	function closeDialog() {
		dispatch('close');
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (!open) {
			return;
		}
		if (event.key === 'Escape') {
			closeDialog();
		}
	}

	$: title = summary.failed > 0 ? 'Upload Queue Finished' : 'Upload Complete';
	$: detail = createDetail(summary);

	function createDetail(current: UploadSummary): string {
		const fragments = [`${current.completed} uploaded`];
		if (current.failed > 0) {
			fragments.push(`${current.failed} failed`);
		}
		if (current.canceled > 0) {
			fragments.push(`${current.canceled} canceled`);
		}
		return `${fragments.join(', ')}.`;
	}
</script>

<svelte:window on:keydown={onWindowKeydown} />

{#if open}
	<div class="overlay" role="dialog" aria-modal="true" aria-label="Upload completion status">
		<button type="button" class="backdrop" aria-label="Close upload status dialog" on:click={closeDialog}></button>

		<div class="panel">
			<header>
				<strong>{title}</strong>
				<p>{detail}</p>
				<p class="meta">{summary.total} file{summary.total === 1 ? '' : 's'} processed.</p>
			</header>

			<footer class="actions">
				<button
					type="button"
					on:pointerenter={playHoverSfx}
					on:focus={playHoverSfx}
					on:click={closeDialog}
				>
					Close
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
		width: min(380px, 92vw);
		display: grid;
		gap: 0.8rem;
		padding: 0.95rem 1rem;
		border: 1px solid rgba(164, 172, 182, 0.56);
		background: linear-gradient(160deg, rgba(35, 35, 35, 0.96) 0%, rgba(16, 16, 16, 0.95) 100%);
		color: rgba(245, 248, 252, 0.94);
	}

	header strong {
		display: block;
		font-size: 0.76rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	header p {
		margin: 0.32rem 0 0;
		font-size: 0.66rem;
		letter-spacing: 0.08em;
		color: rgba(205, 211, 220, 0.82);
	}

	.meta {
		color: rgba(244, 228, 124, 0.92);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
	}

	.actions button {
		height: 30px;
		border: 1px solid rgba(170, 178, 188, 0.62);
		background: rgba(255, 255, 255, 0.08);
		color: inherit;
		padding: 0 0.7rem;
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
</style>
