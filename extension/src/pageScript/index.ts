import type { AnyAction, Store } from 'redux';
import type {
  Action,
  ActionCreator,
  PreloadedState,
  Reducer,
  StoreEnhancer,
  StoreEnhancerStoreCreator,
} from 'redux';
import type Immutable from 'immutable';
import type { LiftedAction, LiftedState } from '@redux-devtools/instrument';
import type { Features } from '@redux-devtools/app';
import type { Options } from '../options/syncOptions';
import generateId from './api/generateInstanceId';
import {
  getLocalFilter,
  sendMessage,
  connect,
  extractExtensionConfig,
  saveReplayAnnotation,
  Serialize,
  ConnectResponse,
  ExtractedExtensionConfig,
} from './api';
import type { ContentScriptToPageScriptMessage } from '../contentScript';

let stores: {
  [K in string | number]: Store;
} = {};

export interface SerializeWithImmutable extends Serialize {
  readonly immutable?: typeof Immutable;
  readonly refs?: (new (data: any) => unknown)[] | null;
}

export interface ConfigWithExpandedMaxAge {
  instanceId?: number;
  /**
   * @deprecated Use actionsDenylist instead.
   */
  readonly actionsBlacklist?: string | readonly string[];
  /**
   * @deprecated Use actionsAllowlist instead.
   */
  readonly actionsWhitelist?: string | readonly string[];
  readonly actionsDenylist?: string | readonly string[];
  readonly actionsAllowlist?: string | readonly string[];
  serialize?: boolean | SerializeWithImmutable;
  readonly stateSanitizer?: <S>(state: S, index?: number) => S;
  readonly actionSanitizer?: <A extends Action<unknown>>(
    action: A,
    id?: number
  ) => A;
  readonly predicate?: <S, A extends Action<unknown>>(
    state: S,
    action: A
  ) => boolean;
  readonly latency?: number;
  readonly maxAge?:
    | number
    | (<S, A extends Action<unknown>>(
        currentLiftedAction: LiftedAction<S, A, unknown>,
        previousLiftedState: LiftedState<S, A, unknown> | undefined
      ) => number);
  readonly trace?: boolean | (() => string | undefined);
  readonly traceLimit?: number;
  readonly shouldCatchErrors?: boolean;
  readonly shouldHotReload?: boolean;
  readonly shouldRecordChanges?: boolean;
  readonly shouldStartLocked?: boolean;
  readonly pauseActionType?: unknown;
  name?: string;
  readonly autoPause?: boolean;
  readonly features?: Features;
  readonly type?: string;
  readonly getActionType?: <A extends Action<unknown>>(action: A) => A;
  readonly actionCreators?: {
    readonly [key: string]: ActionCreator<Action<unknown>>;
  };
}

export interface Config extends ConfigWithExpandedMaxAge {
  readonly maxAge?: number;
}

interface ReduxDevtoolsExtension {
  (config?: Config): StoreEnhancer;
  open: () => void;
  notifyErrors: (onError?: () => boolean) => void;
  send: <S, A extends Action<unknown>>(
    action: string | A,
    state: LiftedState<S, A, unknown>,
    config: Config,
    instanceId?: number,
    name?: string
  ) => void;
  listen: (
    onMessage: (message: ContentScriptToPageScriptMessage) => void,
    instanceId: number
  ) => void;
  connect: (preConfig: Config) => ConnectResponse;
  disconnect: () => void;
}

declare global {
  interface Window {
    devToolsOptions: Options;
    __RECORD_REPLAY_ANNOTATION_HOOK__: (kind: string, contents: string) => void;
  }
}

function __REDUX_DEVTOOLS_EXTENSION__<S, A extends Action<unknown>>(
  preConfig: Config = {}
): StoreEnhancer {
  // if (typeof config !== 'object') config = {};
  if (!window.devToolsOptions) window.devToolsOptions = {} as any;

  let store: Store<any, AnyAction>;

  const [config, extractedExtensionConfig] = extractExtensionConfig(preConfig);
  const { instanceId } = extractedExtensionConfig;

  function init() {
    window.__RECORD_REPLAY_ANNOTATION_HOOK__(
      'redux-devtools-setup',
      JSON.stringify({ type: 'init', connectionType: 'redux', instanceId })
    );
  }

  const enhance =
    (): StoreEnhancer =>
    <NextExt, NextStateExt>(
      next: StoreEnhancerStoreCreator<NextExt, NextStateExt>
    ): any => {
      return <S2 extends S, A2 extends A>(
        reducer_: Reducer<S2, A2>,
        initialState_?: PreloadedState<S2>
      ) => {
        const originalStore = next(reducer_, initialState_);

        const newStore: Store<S2, A2> = {
          ...originalStore,
          dispatch: (action: A2) => {
            const result = originalStore.dispatch(action);
            saveReplayAnnotation(
              action,
              originalStore.getState(),
              'redux',
              extractedExtensionConfig,
              config!
            );
            return result;
          },
        };

        // @ts-ignore
        store = stores[instanceId] = newStore;

        init();
        return store;
      };
    };

  return enhance();
}

declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION__: ReduxDevtoolsExtension;
  }
}

// noinspection JSAnnotator
window.__REDUX_DEVTOOLS_EXTENSION__ = __REDUX_DEVTOOLS_EXTENSION__ as any;
window.__REDUX_DEVTOOLS_EXTENSION__.open = () => {};
window.__REDUX_DEVTOOLS_EXTENSION__.notifyErrors = () => {};
window.__REDUX_DEVTOOLS_EXTENSION__.send = sendMessage;
window.__REDUX_DEVTOOLS_EXTENSION__.listen = () => {};
window.__REDUX_DEVTOOLS_EXTENSION__.connect = connect;
window.__REDUX_DEVTOOLS_EXTENSION__.disconnect = () => {};

export type InferComposedStoreExt<StoreEnhancers> = StoreEnhancers extends [
  infer HeadStoreEnhancer,
  ...infer RestStoreEnhancers
]
  ? HeadStoreEnhancer extends StoreEnhancer<infer StoreExt>
    ? StoreExt & InferComposedStoreExt<RestStoreEnhancers>
    : never
  : unknown;

const extensionCompose =
  (config: Config) =>
  <StoreEnhancers extends readonly StoreEnhancer<unknown>[]>(
    ...funcs: StoreEnhancers
  ): StoreEnhancer<InferComposedStoreExt<StoreEnhancers>> => {
    // @ts-ignore FIXME
    return (...args) => {
      const instanceId = generateId(config.instanceId);
      return [...funcs].reduceRight(
        // @ts-ignore FIXME
        (composed, f) => f(composed),
        __REDUX_DEVTOOLS_EXTENSION__({ ...config, instanceId })(...args)
      );
    };
  };

interface ReduxDevtoolsExtensionCompose {
  (config: Config): <StoreEnhancers extends readonly StoreEnhancer<unknown>[]>(
    ...funcs: StoreEnhancers
  ) => StoreEnhancer<InferComposedStoreExt<StoreEnhancers>>;
  <StoreEnhancers extends readonly StoreEnhancer<unknown>[]>(
    ...funcs: StoreEnhancers
  ): StoreEnhancer<InferComposedStoreExt<StoreEnhancers>>;
}

declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION_COMPOSE__: ReduxDevtoolsExtensionCompose;
  }
}

function reduxDevtoolsExtensionCompose(
  config: Config
): <StoreEnhancers extends readonly StoreEnhancer<unknown>[]>(
  ...funcs: StoreEnhancers
) => StoreEnhancer<InferComposedStoreExt<StoreEnhancers>>;
function reduxDevtoolsExtensionCompose<
  StoreEnhancers extends readonly StoreEnhancer<unknown>[]
>(
  ...funcs: StoreEnhancers
): StoreEnhancer<InferComposedStoreExt<StoreEnhancers>>;
function reduxDevtoolsExtensionCompose(
  ...funcs: [Config] | StoreEnhancer<unknown>[]
) {
  if (funcs.length === 0) {
    return __REDUX_DEVTOOLS_EXTENSION__();
  }
  if (funcs.length === 1 && typeof funcs[0] === 'object') {
    return extensionCompose(funcs[0]);
  }
  return extensionCompose({})(...(funcs as StoreEnhancer<unknown>[]));
}

window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ = reduxDevtoolsExtensionCompose;
