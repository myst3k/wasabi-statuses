# Wasabi Status Dashboard

A clean, client-side status dashboard for [Wasabi Technologies](https://wasabi.com) that visualizes 90-day uptime across all storage regions and services.

**Live site:** https://myst3k.github.io/wasabi-statuses/

## What it does

- Fetches live data from the [Wasabi StatusPage](https://status.wasabi.com) public API
- Displays 90-day uptime bars for each storage region and service
- Shows incident history with expandable update timelines
- Calculates per-component uptime percentages from incident downtime windows

## How it works

Entirely client-side — no build step, no backend. On page load, `app.js` fetches from the StatusPage.io v2 API (`status.wasabi.com/api/v2/`), computes downtime per component per day, and renders the dashboard.

Deployed automatically to GitHub Pages on push to `main`.

## Inspired by

[github-statuses](https://mrshu.github.io/github-statuses/) — a project that reconstructs GitHub's platform uptime metrics from archived status feeds. This project takes a simpler approach since Wasabi's StatusPage.io API provides structured data directly.
