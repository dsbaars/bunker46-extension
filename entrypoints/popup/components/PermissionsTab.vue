<script setup lang="ts">
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import CardHeader from '@/components/ui/CardHeader.vue';
import CardContent from '@/components/ui/CardContent.vue';
import Input from '@/components/ui/Input.vue';
import Badge from '@/components/ui/Badge.vue';
import { Globe, Plus, Search, ShieldCheck, Trash2 } from 'lucide-vue-next';
import { t } from '@/lib/i18n';
import type { DomainPolicies } from '../types';

defineProps<{
  privacyMode: boolean;
  currentTabDomain: string;
  currentTabIsWhitelisted: boolean;
  permissionSearchQuery: string;
  permissionDomains: string[];
  filteredPermissionDomains: string[];
  permissions: DomainPolicies;
  nostrWhitelist: string[];
  isWhitelistOnly: (host: string) => boolean;
  getMethodLabel: (method: string) => string;
}>();

defineEmits<{
  (e: 'update:permission-search-query', value: string): void;
  (e: 'add-current-tab-to-whitelist'): void;
  (e: 'remove-from-whitelist', host: string): void;
  (e: 'revoke-domain', host: string): void;
  (e: 'revoke-permission', host: string, method: string): void;
}>();
</script>

<template>
  <div class="flex flex-col gap-3 p-5 max-h-[400px] overflow-hidden min-h-0">
    <Button
      v-if="privacyMode && currentTabDomain && !currentTabIsWhitelisted"
      variant="outline"
      size="sm"
      class="w-full shrink-0"
      :title="t('addToWhitelistTitle', currentTabDomain)"
      @click="$emit('add-current-tab-to-whitelist')"
    >
      <Plus class="size-3.5" />
      {{ t('addToWhitelistButton', currentTabDomain) }}
    </Button>
    <Button
      v-else-if="privacyMode && currentTabDomain && currentTabIsWhitelisted"
      variant="outline"
      size="sm"
      class="w-full shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10 hover:border-destructive"
      :title="t('removeFromWhitelistTitle', currentTabDomain)"
      @click="$emit('remove-from-whitelist', currentTabDomain)"
    >
      <Trash2 class="size-3.5" />
      {{ t('removeFromWhitelistButton', currentTabDomain) }}
    </Button>

    <div class="relative shrink-0">
      <Search
        class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
        aria-hidden="true"
      />
      <Input
        :model-value="permissionSearchQuery"
        type="text"
        :placeholder="t('searchDomainsPlaceholder')"
        class="pl-8 text-xs h-8"
        @update:model-value="$emit('update:permission-search-query', String($event))"
      />
    </div>

    <div class="flex flex-col gap-3 overflow-y-auto min-h-0">
      <div
        v-if="permissionDomains.length === 0"
        class="flex flex-col items-center justify-center py-10 text-center"
      >
        <ShieldCheck class="size-10 text-muted-foreground/50 mb-3" />
        <p class="text-sm font-medium text-muted-foreground">{{ t('noPermissionsYet') }}</p>
        <p class="text-xs text-muted-foreground/70 mt-1 max-w-[250px]">
          {{ t('noPermissionsHint') }}
        </p>
      </div>

      <div
        v-else-if="filteredPermissionDomains.length === 0"
        class="flex flex-col items-center justify-center py-8 text-center"
      >
        <p class="text-sm font-medium text-muted-foreground">{{ t('noDomainsMatch') }}</p>
      </div>

      <Card v-for="host in filteredPermissionDomains" :key="host">
        <CardHeader class="pb-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0">
              <Globe class="size-3.5 text-muted-foreground shrink-0" />
              <span class="text-sm font-medium truncate">{{ host }}</span>
            </div>
            <Button
              v-if="permissions[host] && Object.keys(permissions[host]).length > 0"
              variant="ghost"
              size="icon"
              class="size-7 shrink-0 text-muted-foreground hover:text-destructive"
              :title="t('revokeAllPermissionsTitle')"
              @click="$emit('revoke-domain', host)"
            >
              <Trash2 class="size-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent class="pt-0">
          <div v-if="isWhitelistOnly(host)" class="py-1.5 text-xs text-muted-foreground">
            {{ t('whitelistedNoPermissions') }}
          </div>
          <div v-else class="flex flex-col gap-1.5">
            <div
              v-for="(entry, method) in permissions[host]"
              :key="method"
              class="flex items-center justify-between py-1"
            >
              <span class="text-xs text-muted-foreground">
                {{ getMethodLabel(method as string) }}
              </span>
              <div class="flex items-center gap-2">
                <Badge
                  :variant="entry.decision === 'allow' ? 'success' : 'destructive'"
                  class="text-[10px] px-1.5 py-0"
                >
                  {{ entry.decision === 'allow' ? t('allowed') : t('denied') }}
                </Badge>
                <button
                  class="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                  :title="t('revokeTitle')"
                  @click="$emit('revoke-permission', host, method as string)"
                >
                  <Trash2 class="size-3" />
                </button>
              </div>
            </div>
          </div>
          <Button
            v-if="nostrWhitelist.includes(host.toLowerCase())"
            variant="outline"
            size="sm"
            class="mt-2 w-full text-xs border-destructive/50 text-destructive hover:bg-destructive/10 hover:border-destructive h-7"
            :title="t('removeFromWhitelist')"
            @click="$emit('remove-from-whitelist', host)"
          >
            <Trash2 class="size-3" />
            {{ t('removeFromWhitelist') }}
          </Button>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
