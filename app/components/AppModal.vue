<script setup lang="ts">
import { X } from 'lucide-vue-next'
defineProps<{ title: string; subtitle?: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement>()
let previousFocus: HTMLElement | null = null
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
  if (event.key !== 'Tab' || !panel.value) return
  const elements = [
    ...panel.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
    ),
  ]
  const first = elements[0],
    last = elements.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}
onMounted(() => {
  previousFocus = document.activeElement as HTMLElement
  document.body.style.overflow = 'hidden'
  panel.value?.focus()
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onKey)
  previousFocus?.focus()
})
</script>
<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="emit('close')">
      <section
        ref="panel"
        class="modal-panel"
        :class="{ 'modal-wide': wide }"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabindex="-1"
      >
        <div class="modal-heading">
          <div>
            <h2 id="modal-title">{{ title }}</h2>
            <p v-if="subtitle">{{ subtitle }}</p>
          </div>
          <button class="icon-button" aria-label="关闭弹窗" @click="emit('close')">
            <X :size="21" />
          </button>
        </div>
        <slot />
      </section>
    </div>
  </Teleport>
</template>
