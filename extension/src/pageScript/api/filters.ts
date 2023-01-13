import type { Action } from 'redux';
import type { LiftedState, PerformAction } from '@redux-devtools/instrument';
import type { LocalFilter } from '@redux-devtools/utils';

export type FilterStateValue =
  | 'DO_NOT_FILTER'
  | 'DENYLIST_SPECIFIC'
  | 'ALLOWLIST_SPECIFIC';

export const FilterState: { [K in FilterStateValue]: FilterStateValue } = {
  DO_NOT_FILTER: 'DO_NOT_FILTER',
  DENYLIST_SPECIFIC: 'DENYLIST_SPECIFIC',
  ALLOWLIST_SPECIFIC: 'ALLOWLIST_SPECIFIC',
};

export const noFiltersApplied = (localFilter: LocalFilter | undefined) =>
  !localFilter &&
  (!window.devToolsOptions ||
    !window.devToolsOptions.filter ||
    window.devToolsOptions.filter === FilterState.DO_NOT_FILTER);

export function isFiltered<A extends Action<unknown>>(
  action: A | string,
  localFilter: LocalFilter | undefined
) {
  if (
    noFiltersApplied(localFilter) ||
    (typeof action !== 'string' &&
      typeof (action.type as string).match !== 'function')
  ) {
    return false;
  }

  const { allowlist, denylist } = localFilter || window.devToolsOptions || {};
  const actionType = ((action as A).type || action) as string;
  return (
    (allowlist && !actionType.match(allowlist)) ||
    (denylist && actionType.match(denylist))
  );
}

export interface PartialLiftedState<S, A extends Action<unknown>> {
  readonly actionsById: { [actionId: number]: PerformAction<A> };
  readonly computedStates: { state: S; error?: string }[];
  readonly stagedActionIds: readonly number[];
  readonly currentStateIndex: number;
  readonly nextActionId: number;
  readonly committedState?: S;
}
