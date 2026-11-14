# Moonlighter Floor Forge

Экспериментальный модуль для Foundry VTT v13 / D&D 5e: процедурные комнаты, соединённые двери, сундуки Item Piles и торговля артефактами.

## Установка через Foundry

В Foundry Setup откройте **Add-on Modules → Install Module** и вставьте **Manifest URL**:

```text
https://raw.githubusercontent.com/Danacra/Moonlighter/main/module.json
```

После установки включите модуль в вашем мире. Для сундуков и торговли через Item Piles необходимы отдельно установленные **Item Piles** и **Item Piles: D&D 5e**.

Готовый ZIP текущей версии: https://github.com/Danacra/Moonlighter/releases/latest/download/moonlighter-floor-forge.zip

## Автоматические релизы

Проект находится в каталоге `moonlighter-floor-forge/`. При изменениях исходников в этом каталоге GitHub Actions автоматически проверяет манифест, упаковывает весь каталог и публикует `moonlighter-floor-forge.zip` в GitHub Releases. При выпуске новой версии нужно обновить `version` как во вложенном `moonlighter-floor-forge/module.json`, так и в корневом `module.json`.

[Релизы](https://github.com/Danacra/Moonlighter/releases) · [Сборки](https://github.com/Danacra/Moonlighter/actions)

**Внимание:** модуль экспериментальный, полноценное тестирование в запущенной Foundry VTT пока не проведено. Сохраните резервную копию мира перед использованием.
