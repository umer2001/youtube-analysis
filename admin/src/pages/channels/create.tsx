import React from "react";
import { useForm } from "@refinedev/react-hook-form";
import { useNavigate } from "react-router";

import { CreateView } from "@/components/refine-ui/views/create-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ChannelFormValues {
  title: string;
  channel_url: string;
  channel_id: string;
  description: string;
  is_active: boolean;
}

export const ChannelCreate = () => {
  const navigate = useNavigate();

  const {
    refineCore: { onFinish },
    ...form
  } = useForm<ChannelFormValues>({
    defaultValues: {
      title: "",
      channel_url: "",
      channel_id: "",
      description: "",
      is_active: true,
    },
    refineCoreProps: {
      resource: "channels",
      redirect: "list",
    },
  });

  function onSubmit(values: any) {
    onFinish(values);
  }

  return (
    <CreateView>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Add Tracked Channel</CardTitle>
          <CardDescription>
            Register a new YouTube livestream trading channel to be monitored by the automated pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="channel_url"
                rules={{ required: "YouTube Channel URL is required" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Channel URL *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="https://www.youtube.com/@ChannelHandle"
                      />
                    </FormControl>
                    <FormDescription>
                      Full URL or handle of the YouTube channel (e.g. https://www.youtube.com/@TradeLikeMalika).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Channel Title / Display Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g. Booming Bulls"
                      />
                    </FormControl>
                    <FormDescription>
                      Friendly name for the channel. If left blank, it can be fetched by the poller.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="channel_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>YouTube Channel ID (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g. UC7QFqtxMMFsPUO2rxZsBKEA"
                      />
                    </FormControl>
                    <FormDescription>
                      The standard 24-character YouTube Channel ID starting with UC...
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description / Trading Focus</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="e.g. Daily Gold scalping and NY Session trading"
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3 shadow-xs">
                    <div className="space-y-0.5">
                      <FormLabel>Active Monitoring</FormLabel>
                      <FormDescription>
                        When enabled, the automated pipeline will poll this channel for completed livestreams.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  {...form.saveButtonProps}
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? "Saving Channel..." : "Save Channel"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(-1)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </CreateView>
  );
};
