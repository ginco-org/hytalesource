import { BehaviorSubject, combineLatest, distinct, distinctUntilChanged, map, Observable, switchMap, throttleTime } from 'rxjs';
import { hytaleJar } from './HytaleApi';
import { agreedEula } from './Settings';
import { performSearch } from './Search';

// Only subscribe to hytaleJar if EULA is accepted
export const fileList = agreedEula.observable.pipe(
    switchMap(agreed => {
        if (!agreed) {
            return new Promise<string[]>(() => { });
        }
        return hytaleJar.pipe(
            distinctUntilChanged(),
            map(jar => Object.keys(jar.jar.entries))
        );
    })
);

// File list that only contains outer class files
export const classesList = fileList.pipe(
    map(files => files.filter(file => file.endsWith('.class') && !file.includes('$')))
);

export const searchQuery = new BehaviorSubject("");

const debouncedSearchQuery: Observable<string> = searchQuery.pipe(
    throttleTime(200),
    distinctUntilChanged()
);

export const searchResults: Observable<string[]> = combineLatest([classesList, debouncedSearchQuery]).pipe(
    switchMap(([classes, query]) => {
        return [performSearch(query, classes)];
    })
);

export const isSearching = searchQuery.pipe(
    map((query) => query.length > 0)
);