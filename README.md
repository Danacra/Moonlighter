# Moonlighter Floor Forge v0.8.0

Процедурная генерация подземелий **Foundry VTT v13 / D&D 5e**. Режим Procedural Tiles создаёт собственные комнаты на ровной сетке и связывает арки телепортацией; противники появляются при входе, а сундуки поддерживают Item Piles.

## Установка

В Foundry Setup выбери **Add-on Modules → Install Module** и вставь Manifest URL:

```text
https://raw.githubusercontent.com/Danacra/Moonlighter/main/module.json
```

Готовый ZIP: https://github.com/Danacra/Moonlighter/releases/latest/download/moonlighter-floor-forge.zip

## Быстрый тест

Выбери **Procedural Tiles**, 12 комнат, 4×4 слота, зазор 4 клетки, 1 этаж. Размести персонажа в первой комнате, приблизь к подсвеченной арке и проверь переход. В боевую комнату NPC должны появиться при первом входе. Для монстров нужны NPC в Actors, для добычи — предметы в Items. Для интерактивных сундуков включи **Item Piles** и **Item Piles: D&D 5e**.

Старые режимы Grid Rooms, Legacy и генерация из загруженных изображений сохранены.

Подробная русская инструкция: [README_RU.md](moonlighter-floor-forge/README_RU.md). История версий: [CHANGELOG.md](moonlighter-floor-forge/CHANGELOG.md).

**Модуль экспериментальный.** Автоматические тесты прошли, в реальном клиенте Foundry VTT v13 пока не проверен. Перед установкой сделай резервную копию мира.
