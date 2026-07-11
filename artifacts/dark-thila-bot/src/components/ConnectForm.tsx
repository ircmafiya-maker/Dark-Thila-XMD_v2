import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useConnectSession, getListSessionsQueryKey, ConnectRequestMethod } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "./ui/form";
import { Input } from "./ui/input";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Terminal } from "lucide-react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";

const formSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required").regex(/^[a-zA-Z0-9_-]+$/, "Alphanumeric only"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  method: z.enum([ConnectRequestMethod.qr, ConnectRequestMethod.pairing]),
});

type FormValues = z.infer<typeof formSchema>;

const fieldVariants: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: 0.1 + i * 0.08, duration: 0.4, ease: "easeOut" as never },
  }),
};

export function ConnectForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const connectSession = useConnectSession();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sessionId: "",
      phoneNumber: "",
      method: ConnectRequestMethod.qr,
    },
  });

  const onSubmit = (values: FormValues) => {
    connectSession.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          toast({
            title: "Session Initialized",
            description: `Session ${values.sessionId} is starting...`,
          });
          form.reset();
        },
        onError: (error) => {
          toast({
            title: "Connection Failed",
            description: error.message || "An error occurred",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <Card className="border-primary/20 bg-card/50 backdrop-blur relative overflow-hidden">
        <motion.div
          className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
        <CardHeader>
          <CardTitle className="text-primary flex items-center gap-2">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <Terminal className="w-5 h-5" />
            </motion.div>
            INITIALIZE_SESSION
          </CardTitle>
          <CardDescription>Deploy a new WhatsApp bot node.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <motion.div custom={0} variants={fieldVariants} initial="hidden" animate="visible">
                <FormField
                  control={form.control}
                  name="sessionId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-widest text-muted-foreground">Node ID</FormLabel>
                      <FormControl>
                        <Input placeholder="node-alpha-1" className="font-mono bg-background" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </motion.div>

              <motion.div custom={1} variants={fieldVariants} initial="hidden" animate="visible">
                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-widest text-muted-foreground">Target Comm Link</FormLabel>
                      <FormControl>
                        <Input placeholder="+1234567890" className="font-mono bg-background" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </motion.div>

              <motion.div custom={2} variants={fieldVariants} initial="hidden" animate="visible">
                <FormField
                  control={form.control}
                  name="method"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel className="text-xs uppercase tracking-widest text-muted-foreground">Auth Protocol</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex gap-4"
                        >
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value={ConnectRequestMethod.qr} />
                            </FormControl>
                            <FormLabel className="font-mono">QR_MATRIX</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value={ConnectRequestMethod.pairing} />
                            </FormControl>
                            <FormLabel className="font-mono">PAIRING_CODE</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </motion.div>

              <motion.div
                custom={3}
                variants={fieldVariants}
                initial="hidden"
                animate="visible"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  type="submit"
                  className="w-full font-mono uppercase tracking-widest"
                  disabled={connectSession.isPending}
                >
                  {connectSession.isPending ? (
                    <motion.span
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                    >
                      EXECUTING...
                    </motion.span>
                  ) : (
                    "EXECUTE_DEPLOYMENT"
                  )}
                </Button>
              </motion.div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
