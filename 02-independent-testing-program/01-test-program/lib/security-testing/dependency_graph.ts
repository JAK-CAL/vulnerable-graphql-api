import {DependencyEdge, OperationCatalogEntry} from './types';

function hasArg(entry: OperationCatalogEntry, argName: string): boolean {
    return entry.args.some((arg) => arg.name.toLowerCase() === argName.toLowerCase());
}

function producesObjectId(entry: OperationCatalogEntry): boolean {
    return entry.fields.some((field) => field.name === 'id');
}

function consumesId(entry: OperationCatalogEntry): boolean {
    return hasArg(entry, 'id');
}

function edge(from: OperationCatalogEntry, to: OperationCatalogEntry, argName: string, confidence: number): DependencyEdge {
    return {
        from: from.name,
        to: to.name,
        producedType: from.namedReturnType,
        consumedArg: argName,
        bindingRule: 'id',
        confidence: confidence
    };
}

export function buildDependencyGraph(catalog: OperationCatalogEntry[]): DependencyEdge[] {
    const edges: DependencyEdge[] = [];

    catalog.forEach((producer) => {
        if (!producesObjectId(producer)) {
            return;
        }

        catalog.forEach((consumer) => {
            if (producer.name === consumer.name || !consumesId(consumer)) {
                return;
            }

            if (producer.namedReturnType === consumer.namedReturnType) {
                edges.push(edge(producer, consumer, 'id', 1.0));
            }
            else if (consumer.classification.indexOf('read_by_id') >= 0 || consumer.classification.indexOf('update') >= 0 || consumer.classification.indexOf('delete') >= 0) {
                edges.push(edge(producer, consumer, 'id', 0.35));
            }
        });
    });

    return edges;
}

export function compatibleTargets(catalog: OperationCatalogEntry[], edges: DependencyEdge[], fromOperation: string, tags: string[]): OperationCatalogEntry[] {
    const allowed = edges
        .filter((item) => item.from === fromOperation)
        .map((item) => item.to);

    return catalog.filter((entry) => {
        if (allowed.indexOf(entry.name) < 0) {
            return false;
        }
        if (tags.length === 0) {
            return true;
        }
        return tags.some((tag) => entry.classification.indexOf(tag) >= 0);
    });
}

export function operationsWithTag(catalog: OperationCatalogEntry[], tag: string, objectType?: string): OperationCatalogEntry[] {
    return catalog.filter((entry) => {
        if (entry.classification.indexOf(tag) < 0) {
            return false;
        }
        return objectType ? entry.namedReturnType === objectType : true;
    });
}
