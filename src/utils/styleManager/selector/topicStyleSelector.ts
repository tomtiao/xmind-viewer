import MindMapStyleSelector, { StyleOptions } from './mindMapStyleSelector'
import ViewController from '../../../viewController/viewController'
import BranchViewController from '../../../viewController/branchViewController'
import { ClassType, StyleKey } from '../../../common/constants/styles'
import { isAttachedBranch, getBranchIndex, getParentBranch } from '../../branchUtils'
import defaultStyles from '../defaultStyles'

export default class TopicStyleSelector extends MindMapStyleSelector {

  protected getClassName(target: ViewController): string {
    if (target instanceof BranchViewController) {
      if (target.isFloatingRoot()) return ClassType.FLOATING_TOPIC
      let ancestor = target.parent
      while (ancestor instanceof BranchViewController) {
        if (ancestor.isFloatingRoot()) return ClassType.SUB_TOPIC
        ancestor = ancestor.parent
      }
      const layer = target.getLayer()
      if (layer === 1) {
        return ClassType.CENTRAL_TOPIC
      } else if (isAttachedBranch(target)) {
        return layer === 2 ? ClassType.MAIN_TOPIC : ClassType.SUB_TOPIC
      }
    }
    return ''
  }

  protected getDefaultStyleValue(target: ViewController, key: StyleKey): string {
    if (target instanceof BranchViewController && target.isFloatingRoot()) {
      if ([StyleKey.MARGIN_TOP, StyleKey.MARGIN_BOTTOM, StyleKey.MARGIN_LEFT, StyleKey.MARGIN_RIGHT].includes(key)) return '11pt'
      return defaultStyles.getStyleValue(ClassType.SUB_TOPIC, key)
    }
    return super.getDefaultStyleValue(target, key)
  }

  protected getThemeStyleValue(target: ViewController, key: StyleKey): string {
    if (target instanceof BranchViewController && !target.isFloatingRoot() && target.getLayer() >= 3) {
      const value = this.getTheme(target)?.getLevelStyle(target.getLayer())?.getStyleValue(key)
      if (this.isValidValue(value)) return value
    }
    return super.getThemeStyleValue(target, key)
  }

  protected getParentStyleValue(target: ViewController, key: StyleKey) {
    let value = super.getParentStyleValue(target, key)
    if (this.isValidValue(value)) {
      return value
    }

    if (target instanceof BranchViewController) {
      switch (key) {
        case StyleKey.TEXT_COLOR:
          if (this.getThemeStyleValue(target, key) === 'inherited') return '#000000'
          break
        case StyleKey.FILL_COLOR:
          if (target.isFloatingRoot() && target.sheetViewController.model.floatingTopicAutoColor === 'follow-color-theme' && target.sheetViewController.hasMultiLineColors()) return target.sheetViewController.multiLineColors.split(' ')[0]
          if (target.getLayer() >= 3 && this.getThemeStyleValue(target, StyleKey.FILL_PATTERN) === 'solid' && this.getThemeStyleValue(target, key) === 'inherited') {
            const color = this._getMultiLineColors(target)
            if (/^#[0-9a-f]{6}$/i.test(color || '')) {
              const channels = [1, 3, 5].map(start => Math.round(255 + (parseInt(color.slice(start, start + 2), 16) - 255) * 0.2))
              return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`
            }
          }
          if (this.getThemeStyleValue(target, StyleKey.FILL_PATTERN) === 'none') return 'none'
          if (this.getThemeStyleValue(target, key) === 'inherited') return this._getMultiLineColors(target)
          break
        case StyleKey.LINE_COLOR: {
          return this._getMultiLineColors(target) ||
            this.getThemeStyleValue(target, key) ||
            this._getStyleValueFromParent(target, key, { ignoreDefault: true })
        }

        case StyleKey.BORDER_LINE_COLOR: {
          return this.getThemeStyleValue(target, key) ||
            this.getStyleValue(target, StyleKey.LINE_COLOR, { ignoreDefault: true })
        }

        case StyleKey.BORDER_LINE_WIDTH: {
          return this.getThemeStyleValue(target, key) ||
            this.getStyleValue(target, StyleKey.LINE_WIDTH, { ignoreDefault: true }) ||
            this._getStyleValueFromParent(target, StyleKey.LINE_WIDTH, { ignoreDefault: true })
        }

        case StyleKey.LINE_WIDTH: {
          return this.getThemeStyleValue(target, key) ||
            this._getStyleValueFromParent(target, key, { ignoreDefault: true }) || 
            this.getDefaultStyleValue(target, key)
        }

      }
    }
  }

  private _getStyleValueFromParent(target: BranchViewController, key: StyleKey, options: StyleOptions = {}) {
    const parent = getParentBranch(target)
    return parent && this.getStyleValue(parent, key, options)
  }

  private _getMultiLineColors(target: BranchViewController) {
    if (target.isCentralBranch()) return

    const sheet = target.sheetViewController
    if (sheet.hasMultiLineColors()) {
      let ancestor = target
      while (this.getClassName(ancestor) !== ClassType.MAIN_TOPIC) {
        ancestor = ancestor.parent as BranchViewController
        if (!ancestor) {
          return
        }
      }

      const colors = sheet.multiLineColors.split(' ')
      const indexInParent = getBranchIndex(ancestor)
      indexInParent < 0 ? 0 : indexInParent
      return colors[indexInParent % colors.length]
    }
  }

}
