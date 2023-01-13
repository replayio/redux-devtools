import type { Options } from 'jsan';
import type { AnyAction } from 'redux';
import type { LocalFilter } from '@redux-devtools/utils';
import { isFiltered, PartialLiftedState } from './filters';
import generateId from './generateInstanceId';
import type { Config } from '../index';
import type { Action } from 'redux';
import type { LiftedState, PerformAction } from '@redux-devtools/instrument';
import type { LibConfig } from '@redux-devtools/app';
import type {
  ContentScriptToPageScriptMessage,
  ListenerMessage,
} from '../../contentScript';
import type { Position } from './openWindow';

const listeners: {
  [instanceId: string]:
    | ((message: ContentScriptToPageScriptMessage) => void)
    | ((message: ContentScriptToPageScriptMessage) => void)[];
} = {};
export const source = '@devtools-page';

function isArray(arg: unknown): arg is readonly unknown[] {
  return Array.isArray(arg);
}

export function getLocalFilter(config: Config): LocalFilter | undefined {
  const denylist = config.actionsDenylist ?? config.actionsBlacklist;
  const allowlist = config.actionsAllowlist ?? config.actionsWhitelist;
  if (denylist || allowlist) {
    return {
      allowlist: isArray(allowlist) ? allowlist.join('|') : allowlist,
      denylist: isArray(denylist) ? denylist.join('|') : denylist,
    };
  }
  return undefined;
}

export interface Serialize {
  readonly replacer?: (key: string, value: unknown) => unknown;
  readonly reviver?: (key: string, value: unknown) => unknown;
  readonly options?: Options | boolean;
}

interface InitInstancePageScriptToContentScriptMessage {
  readonly type: 'INIT_INSTANCE';
  readonly instanceId: number;
  readonly source: typeof source;
}

interface DisconnectMessage {
  readonly type: 'DISCONNECT';
  readonly source: typeof source;
}

interface InitMessage<S, A extends Action<unknown>> {
  readonly type: 'INIT';
  readonly payload: string;
  readonly instanceId: number;
  readonly source: typeof source;
  action?: string;
  name?: string | undefined;
  liftedState?: LiftedState<S, A, unknown>;
  libConfig?: LibConfig;
}

interface SerializedPartialLiftedState {
  readonly stagedActionIds: readonly number[];
  readonly currentStateIndex: number;
  readonly nextActionId: number;
}

interface SerializedPartialStateMessage {
  readonly type: 'PARTIAL_STATE';
  readonly payload: SerializedPartialLiftedState;
  readonly source: typeof source;
  readonly instanceId: number;
  readonly maxAge: number;
  readonly actionsById: string;
  readonly computedStates: string;
  readonly committedState: boolean;
}

interface SerializedExportMessage {
  readonly type: 'EXPORT';
  readonly payload: string;
  readonly committedState: string | undefined;
  readonly source: typeof source;
  readonly instanceId: number;
}

interface SerializedActionMessage {
  readonly type: 'ACTION';
  readonly payload: string;
  readonly source: typeof source;
  readonly instanceId: number;
  readonly action: string;
  readonly maxAge: number;
  readonly nextActionId?: number;
}

interface SerializedStateMessage<S, A extends Action<unknown>> {
  readonly type: 'STATE';
  readonly payload: Omit<
    LiftedState<S, A, unknown>,
    'actionsById' | 'computedStates' | 'committedState'
  >;
  readonly source: typeof source;
  readonly instanceId: number;
  readonly libConfig?: LibConfig;
  readonly actionsById: string;
  readonly computedStates: string;
  readonly committedState: boolean;
}

interface OpenMessage {
  readonly source: typeof source;
  readonly type: 'OPEN';
  readonly position: Position;
}

export type PageScriptToContentScriptMessageForwardedToMonitors<
  S,
  A extends Action<unknown>
> =
  | InitMessage<S, A>
  | LiftedMessage
  | SerializedPartialStateMessage
  | SerializedExportMessage
  | SerializedActionMessage
  | SerializedStateMessage<S, A>;

export type PageScriptToContentScriptMessageWithoutDisconnectOrInitInstance<
  S,
  A extends Action<unknown>
> =
  | PageScriptToContentScriptMessageForwardedToMonitors<S, A>
  | ErrorMessage
  | GetReportMessage
  | StopMessage
  | OpenMessage;

export type PageScriptToContentScriptMessageWithoutDisconnect<
  S,
  A extends Action<unknown>
> =
  | PageScriptToContentScriptMessageWithoutDisconnectOrInitInstance<S, A>
  | InitInstancePageScriptToContentScriptMessage
  | InitInstanceMessage;

export type PageScriptToContentScriptMessage<S, A extends Action<unknown>> =
  | PageScriptToContentScriptMessageWithoutDisconnect<S, A>
  | DisconnectMessage;

interface LiftedMessage {
  readonly type: 'LIFTED';
  readonly liftedState: { readonly isPaused: boolean | undefined };
  readonly instanceId: number;
  readonly source: typeof source;
}

interface PartialStateMessage<S, A extends Action<unknown>> {
  readonly type: 'PARTIAL_STATE';
  readonly payload: PartialLiftedState<S, A>;
  readonly source: typeof source;
  readonly instanceId: number;
  readonly maxAge: number;
}

interface ExportMessage<S, A extends Action<unknown>> {
  readonly type: 'EXPORT';
  readonly payload: readonly A[];
  readonly committedState: S;
  readonly source: typeof source;
  readonly instanceId: number;
}

export interface StructuralPerformAction<A extends Action<unknown>> {
  readonly action: A;
  readonly timestamp?: number;
  readonly stack?: string;
}

type SingleUserAction<A extends Action<unknown>> =
  | PerformAction<A>
  | StructuralPerformAction<A>
  | A;
type UserAction<A extends Action<unknown>> =
  | SingleUserAction<A>
  | readonly SingleUserAction<A>[];

interface ActionMessage<S, A extends Action<unknown>> {
  readonly type: 'ACTION';
  readonly payload: S;
  readonly source: typeof source;
  readonly instanceId: number;
  readonly action: UserAction<A>;
  readonly maxAge: number;
  readonly nextActionId?: number;
  readonly name?: string;
}

interface StateMessage<S, A extends Action<unknown>> {
  readonly type: 'STATE';
  readonly payload: LiftedState<S, A, unknown>;
  readonly source: typeof source;
  readonly instanceId: number;
  readonly libConfig?: LibConfig;
  readonly action?: UserAction<A>;
  readonly maxAge?: number;
  readonly name?: string;
}

export interface ErrorMessage {
  readonly type: 'ERROR';
  readonly payload: string;
  readonly source: typeof source;
  readonly instanceId: number;
  readonly message?: string | undefined;
}

interface InitInstanceMessage {
  readonly type: 'INIT_INSTANCE';
  readonly payload: undefined;
  readonly source: typeof source;
  readonly instanceId: number;
}

interface GetReportMessage {
  readonly type: 'GET_REPORT';
  readonly payload: string;
  readonly source: typeof source;
  readonly instanceId: number;
}

interface StopMessage {
  readonly type: 'STOP';
  readonly payload: undefined;
  readonly source: typeof source;
  readonly instanceId: number;
}

type ToContentScriptMessage<S, A extends Action<unknown>> =
  | LiftedMessage
  | PartialStateMessage<S, A>
  | ExportMessage<S, A>
  | ActionMessage<S, A>
  | StateMessage<S, A>
  | ErrorMessage
  | InitInstanceMessage
  | GetReportMessage
  | StopMessage;

export type ExtractedExtensionConfig = Pick<
  Config,
  'stateSanitizer' | 'actionSanitizer' | 'predicate'
> & {
  instanceId: number;
  isFiltered: typeof isFiltered;
  localFilter: LocalFilter | undefined;
};

export interface LastSavedValues {
  action: string | AnyAction;
  state: any;
  extractedConfig: ExtractedExtensionConfig;
  config: Config;
}

let latestDispatchedActions: Record<string, LastSavedValues> = {};

export function saveReplayAnnotation(
  action: AnyAction,
  state: any,
  connectionType: 'redux' | 'generic',
  extractedConfig: ExtractedExtensionConfig,
  config: Config
) {
  const { instanceId } = extractedConfig;

  window.__RECORD_REPLAY_ANNOTATION_HOOK__(
    'redux-devtools-setup',
    JSON.stringify({
      type: 'action',
      actionType: action.type,
      connectionType,
      instanceId,
    })
  );

  latestDispatchedActions[instanceId] = {
    action,
    state,
    extractedConfig,
    config,
  };
}

export interface ConnectResponse {
  init: <S, A extends Action<unknown>>(
    state: S,
    liftedData?: LiftedState<S, A, unknown>
  ) => void;
  subscribe: <S, A extends Action<unknown>>(
    listener: (message: ListenerMessage<S, A>) => void
  ) => (() => void) | undefined;
  unsubscribe: () => void;
  send: <S, A extends Action<unknown>>(
    action: A,
    state: LiftedState<S, A, unknown>
  ) => void;
  error: (payload: string) => void;
}

export function connect(preConfig: Config): ConnectResponse {
  const config = preConfig || {};
  const instanceId = generateId(config.instanceId);
  if (!config.instanceId) config.instanceId = instanceId;
  if (!config.name) {
    config.name =
      document.title && instanceId === 1
        ? document.title
        : `Instance ${instanceId}`;
  }
  const localFilter = getLocalFilter(config);
  let { stateSanitizer, actionSanitizer, predicate } = config;

  const extractedExtensionConfig: ExtractedExtensionConfig = {
    instanceId: instanceId,
    stateSanitizer,
    actionSanitizer,
    predicate,
    localFilter,
    isFiltered,
  };

  const subscribe = <S, A extends Action<unknown>>(
    listener: (message: ListenerMessage<S, A>) => void
  ) => {
    if (!listener) return undefined;

    return function unsubscribe() {};
  };

  const unsubscribe = () => {
    delete listeners[instanceId];
  };

  const send = <S, A extends Action<unknown>>(
    action: A,
    state: LiftedState<S, A, unknown>
  ) => {
    if (!action) {
      return;
    }

    let amendedAction: AnyAction = action;

    if (typeof action === 'string') {
      amendedAction = { type: action };
    }

    saveReplayAnnotation(
      amendedAction,
      state,
      'generic',
      extractedExtensionConfig,
      config
    );
    return;
  };

  const init = <S, A extends Action<unknown>>(
    state: S,
    liftedData?: LiftedState<S, A, unknown>
  ) => {
    window.__RECORD_REPLAY_ANNOTATION_HOOK__(
      'redux-devtools-setup',
      JSON.stringify({ type: 'init', connectionType: 'generic', instanceId })
    );
  };

  const error = (payload: string) => {};

  return {
    init,
    subscribe,
    unsubscribe,
    send,
    error,
  };
}
