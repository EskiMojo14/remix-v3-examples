import type { Remix } from "@remix-run/dom";
import { press } from "@remix-run/events/press";
import {
  configureStore,
  createSlice,
  type Dispatch,
  type Store,
} from "@reduxjs/toolkit";

export function ReduxProvider(
  this: Remix.Handle<Store>,
  props: { children: Remix.RemixNode; store: Store }
) {
  this.context.set(props.store);

  return () => props.children;
}

type Selector<State, Selected> = (state: State) => Selected;
type EqualityFn<T> = (a: T, b: T) => boolean;
const strictEqual = <T,>(a: T, b: T) => a === b;

interface GetStore<AppStore extends Store> {
  (handle: Remix.Handle): AppStore;
  withTypes<NewStore extends Store>(): GetStore<NewStore>;
}

const getStore = Object.assign(
  (handle: Remix.Handle) => {
    const store = handle.context.get(ReduxProvider);
    if (!store) {
      throw new Error(
        "No Redux store found, have you added the ReduxProvider?"
      );
    }
    return store;
  },
  {
    withTypes: () => getStore,
  }
) as GetStore<Store>;

interface GetDispatch<AppDispatch extends Dispatch> {
  (handle: Remix.Handle): AppDispatch;
  withTypes<NewDispatch extends Dispatch>(): GetDispatch<NewDispatch>;
}

const getDispatch = Object.assign(
  (handle: Remix.Handle) => getStore(handle).dispatch,
  {
    withTypes: () => getDispatch,
  }
) as GetDispatch<Dispatch>;

type TypedSelect<RootState> = <Selected>(
  handle: Remix.Handle,
  selector: Selector<RootState, Selected>,
  equalityFn?: EqualityFn<Selected>
) => () => Selected;
interface Select {
  <RootState, Selected>(
    handle: Remix.Handle,
    selector: Selector<RootState, Selected>,
    equalityFn?: EqualityFn<Selected>
  ): () => Selected;
  withTypes<RootState>(): TypedSelect<RootState>;
}

const select = Object.assign(
  function select<RootState, Selected>(
    handle: Remix.Handle,
    selector: Selector<RootState, Selected>,
    equalityFn: EqualityFn<Selected> = strictEqual
  ) {
    const store = getStore(handle);
    let selected = selector(store.getState());
    handle.signal.addEventListener(
      "abort",
      store.subscribe(() => {
        const newSelected = selector(store.getState());
        if (!equalityFn(newSelected, selected)) {
          selected = newSelected;
          handle.update();
        }
      }),
      { once: true }
    );
    return () => selected;
  },
  {
    withTypes: () => select,
  }
) as Select;

const counterSlice = createSlice({
  name: "counter",
  initialState: 0,
  reducers: {
    increment(state) {
      return state + 1;
    },
    decrement(state) {
      return state - 1;
    },
  },
  selectors: {
    selectCount: (state) => state,
  },
});

const {
  actions: { increment, decrement },
  selectors: { selectCount },
} = counterSlice;

export const store = configureStore({
  reducer: {
    [counterSlice.name]: counterSlice.reducer,
  },
});

type AppStore = typeof store;
type AppDispatch = AppStore["dispatch"];
type RootState = ReturnType<AppStore["getState"]>;

const getAppStore = getStore.withTypes<AppStore>();
const getAppDispatch = getDispatch.withTypes<AppDispatch>();
const appSelect = select.withTypes<RootState>();

export function ReduxExample(this: Remix.Handle) {
  const dispatch = getAppDispatch(this);
  const count = appSelect(this, selectCount);

  return () => (
    <>
      <p>Count: {count()}</p>
      <button on={[press(() => dispatch(increment()))]}>Increment</button>
      <button on={[press(() => dispatch(decrement()))]}>Decrement</button>
    </>
  );
}
