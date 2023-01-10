import type { ActionCreatorObject } from '@redux-devtools/utils';
import type { AnyAction, Store } from 'redux';
// import throttle from 'lodash/throttle';
import type {
  Action,
  ActionCreator,
  Dispatch,
  PreloadedState,
  Reducer,
  StoreEnhancer,
  StoreEnhancerStoreCreator,
} from 'redux';
import type Immutable from 'immutable';
import type {
  EnhancedStore,
  LiftedAction,
  LiftedState,
  PerformAction,
} from '@redux-devtools/instrument';
import type {
  CustomAction,
  DispatchAction,
  LibConfig,
  Features,
} from '@redux-devtools/app';
// import configureStore, { getUrlParam } from './enhancerStore';
import type { Options } from '../options/syncOptions';
import { isFiltered } from './api/filters';
// import Monitor from './Monitor';
// import {
//   noFiltersApplied,
//   isFiltered,
//   filterState,
//   startingFrom,
// } from './api/filters';
import notifyErrors from './api/notifyErrors';
//import importState from './api/importState';
// import openWindow, { Position } from './api/openWindow';
import generateId from './api/generateInstanceId';
import {
  // toContentScript,
  // sendMessage,
  // setListener,
  // connect,
  //  disconnect,
  // isInIframe,
  // getSerializeParameter,
  getLocalFilter,
  saveReplayAnnotation,
  Serialize,
  StructuralPerformAction,
  ConnectResponse,
  ExtractedExtensionConfig,
} from './api';
import type { ContentScriptToPageScriptMessage } from '../contentScript';

// type EnhancedStoreWithInitialDispatch<
//   S,
//   A extends Action<unknown>,
//   MonitorState
// > = EnhancedStore<S, A, MonitorState> & { initialDispatch: Dispatch<A> };

const source = '@devtools-page';
let stores: {
  [K in string | number]: Store;
} = {};
let reportId: string | null | undefined;

function deprecateParam(oldParam: string, newParam: string) {
  /* eslint-disable no-console */
  console.warn(
    `${oldParam} parameter is deprecated, use ${newParam} instead: https://github.com/reduxjs/redux-devtools/blob/main/extension/docs/API/Arguments.md`
  );
  /* eslint-enable no-console */
}

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
    action: StructuralPerformAction<A> | StructuralPerformAction<A>[],
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
    __REDUX_DEVTOOLS_ANNOTATE_ACTION: (action: any, state: any) => void;
    __RECORD_REPLAY_ANNOTATION_HOOK__: (kind: string, contents: string) => void;
  }
}

// type Serializer = ReturnType<typeof getSerializeParameter>;

const toReg = (str: string) =>
  str !== '' ? str.split('\n').filter(Boolean).join('|') : null;

export const isAllowed = (localOptions: Options) =>
  !localOptions ||
  localOptions.inject ||
  !localOptions.urls ||
  location.href.match(toReg(localOptions.urls)!);

function __REDUX_DEVTOOLS_EXTENSION__<S, A extends Action<unknown>>(
  config?: Config
): StoreEnhancer {
  /* eslint-disable no-param-reassign */
  if (typeof config !== 'object') config = {};
  /* eslint-enable no-param-reassign */
  if (!window.devToolsOptions) window.devToolsOptions = {} as any;

  let store: Store<any, AnyAction>;
  let errorOccurred = false;
  let maxAge: number | undefined;
  let actionCreators: readonly ActionCreatorObject[];
  let sendingActionId = 1;
  const instanceId = generateId(config.instanceId);
  const localFilter = getLocalFilter(config);
  // const serializeState = getSerializeParameter(config);
  // const serializeAction = getSerializeParameter(config);
  let { stateSanitizer, actionSanitizer, predicate, latency = 500 } = config;

  const extractedExtensionConfig: ExtractedExtensionConfig = {
    instanceId,
    // serializeState,
    // serializeAction,
    stateSanitizer,
    actionSanitizer,
    predicate,
    localFilter,
    isFiltered,
  };

  // Deprecate actionsWhitelist and actionsBlacklist
  // if (config.actionsWhitelist) {
  //   deprecateParam('actionsWhiteList', 'actionsAllowlist');
  // }
  // if (config.actionsBlacklist) {
  //   deprecateParam('actionsBlacklist', 'actionsDenylist');
  // }

  /*
  const relayState = throttle(
    (
      liftedState?: LiftedState<S, A, unknown> | undefined,
      libConfig?: LibConfig
    ) => {
      relayAction.cancel();
      const state = liftedState || store.getState();
      sendingActionId = state.nextActionId;
      toContentScript(
        {
          type: 'STATE',
          payload: filterState(
            state,
            localFilter,
            stateSanitizer,
            actionSanitizer,
            predicate
          ),
          source,
          instanceId,
          libConfig,
        },
        serializeState,
        serializeAction
      );
    },
    latency
  );
  */

  // const monitor = new Monitor(relayState);

  /*
  const relayAction = throttle(() => {
    const liftedState = store.getState();
    const nextActionId = liftedState.nextActionId;
    const currentActionId = nextActionId - 1;
    const liftedAction = liftedState.actionsById[currentActionId];

    // Send a single action
    if (sendingActionId === currentActionId) {
      sendingActionId = nextActionId;
      const action = liftedAction.action;
      const computedStates = liftedState.computedStates;
      if (
        isFiltered(action, localFilter) ||
        (predicate &&
          !predicate(computedStates[computedStates.length - 1].state, action))
      ) {
        return;
      }
      const state =
        liftedState.computedStates[liftedState.computedStates.length - 1].state;
      toContentScript(
        {
          type: 'ACTION',
          payload: !stateSanitizer
            ? state
            : stateSanitizer(state, nextActionId - 1),
          source,
          instanceId,
          action: !actionSanitizer
            ? liftedState.actionsById[nextActionId - 1]
            : actionSanitizer(
                liftedState.actionsById[nextActionId - 1].action,
                nextActionId - 1
              ),
          maxAge: getMaxAge(),
          nextActionId,
        },
        serializeState,
        serializeAction
      );
      return;
    }
    

    // Send multiple actions
    const payload = startingFrom(
      sendingActionId,
      liftedState,
      localFilter,
      stateSanitizer,
      actionSanitizer,
      predicate
    );
    sendingActionId = nextActionId;
    if (typeof payload === 'undefined') return;
    if ('skippedActionIds' in payload) {
      toContentScript(
        {
          type: 'STATE',
          payload: filterState(
            payload,
            localFilter,
            stateSanitizer,
            actionSanitizer,
            predicate
          ),
          source,
          instanceId,
        },
        serializeState,
        serializeAction
      );
      return;
    }
    toContentScript(
      {
        type: 'PARTIAL_STATE',
        payload,
        source,
        instanceId,
        maxAge: getMaxAge(),
      },
      serializeState,
      serializeAction
    );
  }, latency);
  */

  /*
  function onMessage(message: ContentScriptToPageScriptMessage) {
    switch (message.type) {
      case 'DISPATCH':
        dispatchMonitorAction(message.payload);
        return;
      case 'ACTION':
        dispatchRemotely(message.payload);
        return;
      case 'IMPORT':
        importPayloadFrom(message.state);
        return;
      case 'EXPORT':
        exportState();
        return;
      case 'UPDATE':
        relayState();
        return;
      case 'START':
        monitor.start(true);
        if (!actionCreators && config!.actionCreators) {
          actionCreators = getActionsArray(config!.actionCreators);
        }
        relayState(undefined, {
          name: config!.name || document.title,
          actionCreators: JSON.stringify(actionCreators),
          features: config!.features,
          serialize: !!config!.serialize,
          type: 'redux',
        });

        if (reportId) {
          toContentScript(
            {
              type: 'GET_REPORT',
              payload: reportId,
              source,
              instanceId,
            },
            serializeState,
            serializeAction
          );
          reportId = null;
        }
        return;
      case 'STOP':
        monitor.stop();
        relayAction.cancel();
        relayState.cancel();
        if (!message.failed) {
          toContentScript(
            {
              type: 'STOP',
              payload: undefined,
              source,
              instanceId,
            },
            serializeState,
            serializeAction
          );
        }
    }
  }
  */

  /*
  const filteredActionIds: number[] = []; // simple circular buffer of non-excluded actions with fixed maxAge-1 length
  const getMaxAge = (
    liftedAction?: LiftedAction<S, A, unknown>,
    liftedState?: LiftedState<S, A, unknown> | undefined
  ) => {
    let m = (config && config.maxAge) || window.devToolsOptions.maxAge || 50;
    if (
      !liftedAction ||
      noFiltersApplied(localFilter) ||
      !(liftedAction as PerformAction<A>).action
    ) {
      return m;
    }
    if (!maxAge || maxAge < m) maxAge = m; // it can be modified in process on options page
    if (isFiltered((liftedAction as PerformAction<A>).action, localFilter)) {
      // TODO: check also predicate && !predicate(state, action) with current state
      maxAge++;
    } else {
      filteredActionIds.push(liftedState!.nextActionId);
      if (filteredActionIds.length >= m) {
        const stagedActionIds = liftedState!.stagedActionIds;
        let i = 1;
        while (
          maxAge > m &&
          filteredActionIds.indexOf(stagedActionIds[i]) === -1
        ) {
          maxAge--;
          i++;
        }
        filteredActionIds.shift();
      }
    }
    return maxAge;
  };
  */

  function init() {
    window.__RECORD_REPLAY_ANNOTATION_HOOK__(
      'redux-devtools-setup',
      JSON.stringify({ type: 'init', connectionType: 'redux', instanceId })
    );
    /*
    setListener(onMessage, instanceId);
    notifyErrors(() => {
      errorOccurred = true;
      const state = store.liftedStore.getState();
      if (state.computedStates[state.currentStateIndex].error) {
        relayState(state);
      }
      return true;
    });

    toContentScript(
      {
        type: 'INIT_INSTANCE',
        payload: undefined,
        source,
        instanceId,
      },
      serializeState,
      serializeAction
    );
    store.subscribe(handleChange);

    if (typeof reportId === 'undefined') {
      reportId = getUrlParam('remotedev_report');
      if (reportId) openWindow();
    }
    */
  }

  /*
  function handleChange() {
    if (!monitor.active) return;
    if (!errorOccurred && !monitor.isMonitorAction()) {
      relayAction();
      return;
    }
    if (monitor.isPaused() || monitor.isLocked() || monitor.isTimeTraveling()) {
      return;
    }
    const liftedState = store.getState();
    if (
      errorOccurred &&
      !liftedState.computedStates[liftedState.currentStateIndex].error
    ) {
      errorOccurred = false;
    }
    relayState(liftedState);
  }
  */

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
        if (!isAllowed(window.devToolsOptions)) {
          return originalStore;
        }

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

        // store = stores[instanceId] = configureStore(
        //   next as StoreEnhancerStoreCreator,
        //   monitor.reducer,
        //   {
        //     ...config,
        //     maxAge: getMaxAge as any,
        //   }
        // )(reducer_, initialState_) as any;

        init();
        // if (isInIframe()) setTimeout(init, 3000);
        // else init();

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
window.__REDUX_DEVTOOLS_EXTENSION__.send = () => {}; // sendMessage;
window.__REDUX_DEVTOOLS_EXTENSION__.listen = () => {};
window.__REDUX_DEVTOOLS_EXTENSION__.connect = (config: Config) => null as any; // connect;
window.__REDUX_DEVTOOLS_EXTENSION__.disconnect = () => {}; // disconnect;

/*
const preEnhancer =
  (instanceId: number): StoreEnhancer =>
  (next) =>
  (reducer, preloadedState) => {
    const store = next(reducer, preloadedState);

    if (stores[instanceId]) {
      (stores[instanceId].initialDispatch as any) = store.dispatch;
    }

    return {
      ...store,
      dispatch: (...args: any[]) =>
        !window.__REDUX_DEVTOOLS_EXTENSION_LOCKED__ &&
        (store.dispatch as any)(...args),
    } as any;
  };
*/

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
