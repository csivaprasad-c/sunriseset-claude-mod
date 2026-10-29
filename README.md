# sun-times

Shows today's sunrise and sunset for your location in the Claude Code status line,
refreshed every five minutes so it rolls over at midnight. Times are computed locally
with the NOAA sunrise equation, so no weather API is needed.

- `/sun`: show today's times
- `/sun <city>`: set the location by name (geocoded with Open-Meteo)
- `/sun <lat>,<lon> [Area/City]`: set exact coordinates, with an optional IANA time zone
- `/sun auto`: guess the location from your IP address

The location is saved across sessions. On first start the mod guesses it from your IP address.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install sun-times --marketplace csivaprasad-c/sunriseset-claude-mod
```

From a shell:

```bash
claude plugin install sun-times --marketplace csivaprasad-c/sunriseset-claude-mod
```
