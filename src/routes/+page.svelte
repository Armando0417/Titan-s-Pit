<script lang="ts">
	import './layout.css';
	import pageBg from '$lib/assets/chapel.jpg';

	type FileItem = {
		name: string;
		size: number;
		type: string;
		modified: string;
	};

	type FolderItem = {
		name: string;
		files: FileItem[];
	};

	const folders: FolderItem[] = [
		{
			name: 'Sprint Docs',
			files: [
				{ name: 'roadmap.md', size: 120, type: 'md', modified: 'Jan 28, 2026' },
				{ name: 'notes.txt', size: 80, type: 'txt', modified: 'Feb 2, 2026' }
			]
		},
		{
			name: 'Design Assets',
			files: [
				{ name: 'hero.png', size: 900, type: 'png', modified: 'Feb 10, 2026' },
				{ name: 'wireframe.svg', size: 330, type: 'svg', modified: 'Feb 12, 2026' }
			]
		},
		{
			name: 'Data Dumps',
			files: [
				{ name: 'metrics.csv', size: 670, type: 'csv', modified: 'Feb 14, 2026' },
				{ name: 'backup.json', size: 520, type: 'json', modified: 'Feb 16, 2026' }
			]
		}
	];

	const files: FileItem[] = [
		{ name: 'app.ts', size: 160, type: 'ts', modified: 'Feb 11, 2026' },
		{ name: 'README.md', size: 100, type: 'md', modified: 'Feb 9, 2026' },
		{ name: 'index.html', size: 70, type: 'html', modified: 'Feb 7, 2026' },
		{ name: 'theme.css', size: 95, type: 'css', modified: 'Feb 15, 2026' },
		{ name: 'payload.json', size: 260, type: 'json', modified: 'Feb 16, 2026' }
	];

	let searchQuery = '';
	let selectedTypes: string[] = [];
	const storageCapacityKb = 5000;

	function toggleType(type: string) {
		if (selectedTypes.includes(type)) {
			selectedTypes = selectedTypes.filter((selectedType) => selectedType !== type);
			return;
		}
		selectedTypes = [...selectedTypes, type];
	}

	function clearTypeFilters() {
		selectedTypes = [];
	}

	function formatSize(kb: number) {
		if (kb >= 1024) {
			return `${(kb / 1024).toFixed(1)} MB`;
		}
		return `${kb} KB`;
	}

	$: normalizedQuery = searchQuery.trim().toLowerCase();
	$: allFileTypes = Array.from(
		new Set([...files, ...folders.flatMap((folder) => folder.files)].map((file) => file.type))
	).sort();
	$: filteredFolders = folders.filter((folder) => {
		const queryMatch =
			normalizedQuery === '' ||
			folder.name.toLowerCase().includes(normalizedQuery) ||
			folder.files.some((file) => file.name.toLowerCase().includes(normalizedQuery));
		const typeMatch =
			selectedTypes.length === 0 || folder.files.some((file) => selectedTypes.includes(file.type));
		return queryMatch && typeMatch;
	});
	$: filteredFiles = files.filter((file) => {
		const queryMatch = normalizedQuery === '' || file.name.toLowerCase().includes(normalizedQuery);
		const typeMatch = selectedTypes.length === 0 || selectedTypes.includes(file.type);
		return queryMatch && typeMatch;
	});
	$: usedStorageKb = files.reduce((total, file) => total + file.size, 0);
	$: storagePercent = Math.min(100, Math.round((usedStorageKb / storageCapacityKb) * 100));
</script>

<div class="app-shell" style={`--page-bg: url(${pageBg})`}>
	<div class="topbar">
		<label class="search-shell" aria-label="Search folders and files">
			<input
				class="search-input"
				type="search"
				placeholder="Search folders or files..."
				bind:value={searchQuery}
			/>
			<span class="search-icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none">
					<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"></circle>
					<path d="M20 20L16.6 16.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"
					></path>
				</svg>
			</span>
		</label>
	</div>

	<div class="two-col">
		<aside>
			<div class="sidebar-top">
				<h1 class="brand-title">Titan&apos;s Pit</h1>
				<p class="brand-line">Central vault for battle-ready files.</p>
				<p class="brand-line">Temp copy: add mission summary and team status here.</p>
				<p class="brand-line">Temp copy: plug in quick links and last sync info.</p>
			</div>

			<div class="sidebar-middle">
				<div class="section-title">File Types</div>
				<div class="type-pills">
					<button
						type="button"
						class:active-pill={selectedTypes.length === 0}
						class="type-pill"
						on:click={clearTypeFilters}>All</button
					>
					{#each allFileTypes as type}
						<button
							type="button"
							class:active-pill={selectedTypes.includes(type)}
							class="type-pill"
							on:click={() => toggleType(type)}
						>
							.{type}
						</button>
					{/each}
				</div>
			</div>

			<div class="sidebar-bottom">
				<div class="storage-head">
					<span>Storage used</span>
					<span>{storagePercent}%</span>
				</div>
				<div class="storage-track">
					<div class="storage-fill" style={`width: ${storagePercent}%`}></div>
				</div>
				<div class="storage-meta">
					{formatSize(usedStorageKb)} / {formatSize(storageCapacityKb)}
				</div>
			</div>
		</aside>
		<main>
			<div class="main-content">
				<div class="folder-div">
					<div class="section-title">Folders</div>
					<div class="folder-grid">
						{#if filteredFolders.length === 0}
							<div class="empty-state">No folders match current filters.</div>
						{:else}
							{#each filteredFolders as folder}
								<div class="folder-card">
									<div>{folder.name}</div>
									<div>{folder.files.length} files</div>
								</div>
							{/each}
						{/if}
					</div>
				</div>
				<div class="file-div">
					<div class="section-title">Files</div>
					<div class="file-list">
						{#if filteredFiles.length === 0}
							<div class="empty-state">No files match current filters.</div>
						{:else}
							<div class="file-header file-grid">
								<span>File name</span>
								<span>Type</span>
								<span>Size</span>
								<span>Date modified</span>
								<span></span>
							</div>
							{#each filteredFiles as file}
								<div class="file-row file-grid">
									<span class="file-name">{file.name}</span>
									<span class="file-type">{file.type.toUpperCase()}</span>
									<span class="file-size">{formatSize(file.size)}</span>
									<span class="file-modified">{file.modified}</span>
									<button
										class="file-menu-btn"
										type="button"
										aria-label={`More options for ${file.name}`}
									>
										&#8942;
									</button>
								</div>
							{/each}
						{/if}
					</div>
				</div>
			</div>
		</main>
	</div>
</div>

<style>
	.app-shell {
		--glass-bg: rgba(0, 0, 0, 0.8);
		--glass-bg-strong: rgba(15, 23, 42, 0.56);
		--glass-border: rgba(255, 255, 255, 0.22);
		--glass-hover: rgba(255, 255, 255, 0.18);
		height: 100vh;
		display: grid;
		grid-template-rows: 60px 1fr;
		background-image: var(--page-bg);
		background-size: cover;
		background-position: center;
		background-repeat: no-repeat;
	}

	.topbar {
		width: 100%;
		height: 60px;
		background-color: var(--glass-bg-strong);
		color: #fff;
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 0 1rem;
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--glass-border);
	}

	.search-shell {
		position: relative;
		width: min(560px, 100%);
	}

	.search-input {
		width: 100%;
		height: 40px;
		border-radius: 9999px;
		border: 1px solid var(--glass-border);
		background-color: rgba(0, 0, 0, 0.35);
		color: #fff;
		padding: 0 2.75rem 0 1rem;
		outline: none;
		backdrop-filter: blur(8px);
	}

	.search-input::placeholder {
		color: rgba(255, 255, 255, 0.75);
	}

	.search-input:focus {
		border-color: rgba(255, 255, 255, 0.65);
	}

	.search-icon {
		position: absolute;
		right: 0.85rem;
		top: 50%;
		transform: translateY(-50%);
		color: rgba(255, 255, 255, 0.85);
		width: 1.1rem;
		height: 1.1rem;
		pointer-events: none;
	}

	.search-icon svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	.two-col {
		--left: 1fr;
		--right: 5fr;
		display: grid;
		grid-template-columns: var(--left) var(--right);
		min-height: 0;
	}

	aside {
		background-color: var(--glass-bg-strong);
		color: #fff;
		padding: 0.75rem;
		backdrop-filter: blur(8px);
		border-right: 1px solid var(--glass-border);
		display: grid;
		grid-template-rows: auto 1fr auto;
		gap: 1rem;
		min-height: 0;
	}

	.sidebar-top {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.brand-title {
		font-size: 1.35rem;
		font-weight: 800;
		line-height: 1.2;
		margin: 0;
	}

	.brand-line {
		margin: 0;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.8);
	}

	.sidebar-middle {
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-height: 0;
	}

	.type-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.type-pill {
		border: 1px solid rgba(255, 255, 255, 0.35);
		background-color: rgba(255, 255, 255, 0.08);
		color: #fff;
		padding: 0.3rem 0.7rem;
		border-radius: 999px;
		font-size: 0.78rem;
		cursor: pointer;
	}

	.type-pill:hover {
		background-color: rgba(255, 255, 255, 0.16);
	}

	.active-pill {
		background-color: rgba(255, 255, 255, 0.28);
		border-color: rgba(255, 255, 255, 0.6);
	}

	.sidebar-bottom {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.storage-head {
		display: flex;
		justify-content: space-between;
		font-size: 0.82rem;
	}

	.storage-track {
		height: 10px;
		border-radius: 999px;
		background-color: rgba(255, 255, 255, 0.14);
		overflow: hidden;
	}

	.storage-fill {
		height: 100%;
		background: linear-gradient(90deg, #4ade80, #22d3ee);
	}

	.storage-meta {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.82);
	}

	main {
		height: 100%;
		min-height: 0;
	}

	.main-content {
		height: 100%;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.folder-div {
		flex: 1.25;
		background-color: var(--glass-bg);
		color: #fff;
		padding: 0.75rem;
		overflow: auto;
		backdrop-filter: blur(8px);
		border: 1px solid var(--glass-border);
	}

	.section-title {
		font-weight: 700;
		margin-bottom: 0.5rem;
		margin-right: 0.5rem;
	}

	.folder-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 0.5rem;
	}

	.folder-card {
		background-color: rgba(255, 255, 255, 0.12);
		padding: 0.5rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.18);
	}

	.file-div {
		flex: 5;
		background-color: var(--glass-bg);
		color: #fff;
		overflow: auto;
		backdrop-filter: blur(8px);
		border: 1px solid var(--glass-border);
	}

	.file-list {
		display: flex;
		flex-direction: column;
	}

	.file-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr)) 60px;
		column-gap: 1rem;
		align-items: center;
		width: 100%;
	}

	.file-header {
		padding: 0.25rem 0.75rem 0.55rem;
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.7);
		border-bottom: 1px solid rgba(255, 255, 255, 0.2);
	}

	.file-header > span:nth-child(2) {
		text-align: left;
	}

	.file-header > span:nth-child(3) {
		text-align: left;
	}

	.file-header > span:nth-child(4) {
		text-align: left;
	}

	.file-header > span:nth-child(5) {
		justify-self: end;
	}

	.file-row {
		display: grid;
		min-height: 50px;
		background-color: rgba(255, 255, 255, 0.08);
		border-bottom: 1px solid rgba(255, 255, 255, 0.2);
		padding: 0.5rem 0.75rem 0.5rem 2rem;
	}

	.file-row:hover {
		background-color: var(--glass-hover);
	}

	.file-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-type,
	.file-modified,
	.file-size {
		color: rgba(255, 255, 255, 0.88);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-size {
		text-align: left;
		font-variant-numeric: tabular-nums;
	}

	.file-modified {
		text-align: left;
	}

	.file-menu-btn {
		height: 28px;
		width: 28px;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.26);
		background-color: rgba(255, 255, 255, 0.05);
		color: #fff;
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		justify-self: end;
	}

	.file-menu-btn:hover {
		background-color: rgba(255, 255, 255, 0.2);
	}

	.empty-state {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.85rem;
		padding: 0.5rem 0;
	}
</style>
