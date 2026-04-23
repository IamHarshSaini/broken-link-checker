import { createSlice } from "@reduxjs/toolkit";

const initialState = {};

const brokenLinkSlice = createSlice({
  name: "brokenlink",
  initialState,
  reducers: {
    addPair: (state, { payload: { key, value = null } }) => {
      if (key && !state[key]) {
        state[key] = value;
      }
    },
    setValue: (state, { payload: { key, value = null } }) => {
      if (key && state[key]) {
        state[key] = value;
      }
    },
  },
});

export const { addPair, setValue } = brokenLinkSlice.actions;

export default brokenLinkSlice.reducer;
