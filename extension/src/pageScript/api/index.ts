import type { Options } from 'jsan';
import type { AnyAction } from 'redux';
import type { LocalFilter } from '@redux-devtools/utils';
import { isFiltered } from './filters';
import generateId from './generateInstanceId';
import type { Config } from '../index';
import type { Action } from 'redux';
import type { LiftedState } from '@redux-devtools/instrument';
import type {
  ContentScriptToPageScriptMessage,
  ListenerMessage,
} from '../../contentScript';

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

export type PageScriptToContentScriptMessageForwardedToMonitors<
  S,
  A extends Action<unknown>
> = any;

export type PageScriptToContentScriptMessageWithoutDisconnectOrInitInstance<
  S,
  A extends Action<unknown>
> = any;

export type PageScriptToContentScriptMessageWithoutDisconnect<
  S,
  A extends Action<unknown>
> = any;

export type PageScriptToContentScriptMessage<
  S,
  A extends Action<unknown>
> = any;

export interface StructuralPerformAction<A extends Action<unknown>> {
  readonly action: A;
  readonly timestamp?: number;
  readonly stack?: string;
}

export interface ErrorMessage {
  readonly type: 'ERROR';
  readonly payload: string;
  readonly source: typeof source;
  readonly instanceId: number;
  readonly message?: string | undefined;
}

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

export function sendMessage<S, A extends Action<unknown>>(
  action: string | A,
  state: LiftedState<S, A, unknown>,
  preConfig: Config = {},
  instanceId?: number,
  name?: string
) {
  if (!action || !(action as A).type) {
    action = { type: 'update' } as A;
  } else if (typeof action === 'string') {
    action = { type: action } as A;
  }

  const [config, extractedExtensionConfig] = extractExtensionConfig(preConfig);
  instanceId = instanceId ?? extractedExtensionConfig.instanceId;

  saveReplayAnnotation(
    action,
    state,
    'generic',
    extractedExtensionConfig,
    config
  );
}

export function extractExtensionConfig(preConfig: Config) {
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

  return [config, extractedExtensionConfig] as const;
}

export function connect(preConfig: Config): ConnectResponse {
  const [config, extractedExtensionConfig] = extractExtensionConfig(preConfig);
  const { instanceId } = extractedExtensionConfig;

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
