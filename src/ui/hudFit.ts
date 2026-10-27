import { useEffect, useRef } from 'react';

/**
 * 手机浏览器里（地址栏、底部工具栏占掉高度）地图可视区很矮，左上和左下两摞浮层会叠在一起。
 * 地图矮就加 tight（整体收紧）；两摞还是放不下就加 crowded（左上那摞限高、可以滑动），保证不互相盖住。
 */
export function useHudFit<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const hud = ref.current;
    if (!hud || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const fit = () => {
      raf = 0;
      const h = hud.clientHeight;
      const narrow = hud.clientWidth < 600;
      hud.classList.toggle('tight', narrow && h < 700);
      const top = hud.querySelector<HTMLElement>('.top-left');
      const chips = hud.querySelector<HTMLElement>('.chips');
      if (!top || !chips) return;
      // 界面缩放用的是 CSS zoom，各浏览器量出来的单位不一样：统一换成屏幕上的像素再比
      const z = top.offsetHeight > 0 ? top.getBoundingClientRect().height / top.offsetHeight : 1;
      const room = hud.getBoundingClientRect().height - chips.getBoundingClientRect().height - 24;
      hud.style.setProperty('--top-room', `${Math.max(120, room) / (z || 1)}px`);
      // 用 scrollHeight 判断，限高以后它不变，不会来回跳
      hud.classList.toggle('crowded', narrow && top.scrollHeight * z > room);
    };
    const later = () => { if (!raf) raf = requestAnimationFrame(fit); };
    const ro = new ResizeObserver(later);
    ro.observe(hud);
    // 两摞的内容随时会变（进副本、组队、任务卡折叠），子元素变了也要重新量
    const mo = new MutationObserver(() => {
      for (const el of hud.querySelectorAll('.top-left, .chips')) ro.observe(el);
      later();
    });
    mo.observe(hud, { childList: true, subtree: true });
    for (const el of hud.querySelectorAll('.top-left, .chips')) ro.observe(el);
    later();
    window.addEventListener('resize', later);
    return () => { window.removeEventListener('resize', later); ro.disconnect(); mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return ref;
}
