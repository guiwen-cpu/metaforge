import { createRouter, createWebHistory } from "vue-router";
import StudioLayout from "@/layouts/StudioLayout.vue";
import AppListPage from "@/pages/AppListPage.vue";
import AppDetailPage from "@/pages/AppDetailPage.vue";
import NotFoundView from "@/views/NotFoundView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: StudioLayout,
      children: [
        { path: "", name: "apps", component: AppListPage },
        { path: "apps/:appId", name: "app-detail", component: AppDetailPage }
      ]
    },
    { path: "/:pathMatch(.*)*", component: NotFoundView }
  ],
  scrollBehavior: () => ({ top: 0 })
});

export default router;