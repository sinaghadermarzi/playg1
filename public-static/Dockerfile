FROM nginx:1.27-alpine

# Replace the default server config with ours
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/site.conf

# Static content
COPY site/ /usr/share/nginx/html/

# CapRover routes traffic to container port 80 by default
EXPOSE 80
