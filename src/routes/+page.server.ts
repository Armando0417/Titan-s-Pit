import type { PageServerLoad } from './$types';
import { getInventoryData } from '$lib/server/copyparty';

type SortKey = 'name' | 'type' | 'size' | 'modified';
type SortDirection = 'asc' | 'desc';
type SidebarTab = 'inventions' | 'forge';

const sortCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export const load: PageServerLoad = async ({ fetch, url }) => {
	const requestedPath = url.searchParams.get('path');
	const sortKey = parseSortKey(url.searchParams.get('sort'));
	const sortDirection = parseSortDirection(url.searchParams.get('dir'));
	const initialTab = parseSidebarTab(url.searchParams.get('tab'));
	const inventory = await getInventoryData({
		fetch,
		requestedPath,
		requestOrigin: url.origin
	});
	const files = [...inventory.files].sort((a, b) =>
		compareFiles(a, b, { sortKey, sortDirection })
	);

	return {
		inventory: {
			...inventory,
			files
		},
		sort: {
			key: sortKey,
			direction: sortDirection
		},
		initialTab
	};
};

function parseSortKey(value: string | null): SortKey {
	if (value === 'type' || value === 'size' || value === 'modified') {
		return value;
	}
	return 'type';
}

function parseSortDirection(value: string | null): SortDirection {
	return value === 'desc' ? 'desc' : 'asc';
}

function parseSidebarTab(value: string | null): SidebarTab {
	return value === 'forge' ? 'forge' : 'inventions';
}

function compareFiles(
	a: {
		name: string;
		size: number;
		modifiedTs: number;
		extension: string | null;
	},
	b: {
		name: string;
		size: number;
		modifiedTs: number;
		extension: string | null;
	},
	{
		sortKey,
		sortDirection
	}: {
		sortKey: SortKey;
		sortDirection: SortDirection;
	}
): number {
	let result = 0;

	if (sortKey === 'name') {
		result = sortCollator.compare(a.name, b.name);
	} else if (sortKey === 'type') {
		const aType = resolveType(a.name, a.extension);
		const bType = resolveType(b.name, b.extension);
		result = sortCollator.compare(aType, bType);
		if (result === 0) {
			result = sortCollator.compare(a.name, b.name);
		}
	} else if (sortKey === 'size') {
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

	return sortDirection === 'asc' ? result : -result;
}

function resolveType(name: string, extension: string | null): string {
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
