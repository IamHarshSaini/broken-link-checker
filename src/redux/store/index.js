import { configureStore } from "@reduxjs/toolkit";
import brokenlinkReducer from "../slices/brokenlink";

export const store = configureStore({
  reducer: {
    brokenlink: brokenlinkReducer,
  },
});
